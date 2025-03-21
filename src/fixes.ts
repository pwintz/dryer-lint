import * as vscode from 'vscode';
import { DiagnosticCollectionName, RegexMatchDiagnostic } from './diagnostics';
import Rule, { ConfigSectionName, RuleSet, RuleSetsConfigName } from './rule';
import { dryerLintLog } from './extension'

type Fix = {
    group: string,
    language: string,
    regex: RegExp,
    // TODO: Create a UUID instead of using the pattern. The current code might break if patterns are not unique!
    ruleId: string, // The "pattern" string provided by the user. 
    string: string, // The "fix" string provided by the user
};

export default function activateFixes(context: vscode.ExtensionContext) {
    refreshFixes(context);

    vscode.workspace.onDidChangeConfiguration(event => {
        // When the user changes the list of rules, register all of the current fixes.
        if (event.affectsConfiguration(RuleSetsConfigName) 
            || event.affectsConfiguration(ConfigSectionName)) {
                refreshFixes(context);
            }
    });
}

const codeActionDisposables: vscode.Disposable[] = []
export function refreshFixes(context: vscode.ExtensionContext){
    
    dryerLintLog(`Start of register fixes: context.subscriptions.length: ${context.subscriptions.length}`)
    let codeActionDisposable;
    while (codeActionDisposable = codeActionDisposables.pop()){
        var index = context.subscriptions.indexOf(codeActionDisposable)
        // var removedItem = 
        context.subscriptions.splice(index)
        // assert(codeActionDisposable === removedItem)
        codeActionDisposable.dispose();
    }
    dryerLintLog(`After popping: context.subscriptions.length: ${context.subscriptions.length}`)

    const ruleSets: RuleSet[] = RuleSet.getAllRules();
    const disposables = ruleSets.flatMap(
        ruleSet => {
            const singleFixProvider = new SingleFixProvider(ruleSet)
            const fixAllProvider    = new FixAllProvider(ruleSet)
            return [
                vscode.languages.registerCodeActionsProvider(ruleSet.getDocumentSelector(), singleFixProvider, 
                                                {
                                                    providedCodeActionKinds: [
                                                        vscode.CodeActionKind.QuickFix
                                                    ]
                                                }), 
                vscode.languages.registerCodeActionsProvider(ruleSet.getDocumentSelector(), fixAllProvider, {
                                                providedCodeActionKinds: [
                                                    vscode.CodeActionKind.SourceFixAll,
                                                    vscode.CodeActionKind.QuickFix // <- This seems out of place, but let's test.
                                                ]
                                            })
           ]
        }
    )
    dryerLintLog(`Created ${disposables.length} code action providers.`)

    // const disposables = [
    //     vscode.languages.registerCodeActionsProvider(fix.language, new SingleFixProvider(fixes), {
    //         providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    //     }),
    //     vscode.languages.registerCodeActionsProvider(fix.language, new FixAllProvider(fixes), {
    //         providedCodeActionKinds: [
    //             vscode.CodeActionKind.SourceFixAll,
    //             vscode.CodeActionKind.QuickFix // <- This seems out of place, but let's test.
    //         ]
    //     })
    // ];
    codeActionDisposables.push(...disposables)
    dryerLintLog(`After pushing: context.subscriptions.length: ${context.subscriptions.length}`)
}

class SingleFixProvider implements vscode.CodeActionProvider
{
    private ruleSet;
    public constructor(ruleSet: RuleSet) {
        this.ruleSet = ruleSet;
     }

    provideCodeActions(
        document: vscode.TextDocument,
        selection_range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const start_time = Date.now();

        if (!this.ruleSet.doesMatchDocument(document)) {
            return []
        }

        const allFixableMatchingRules: Rule[] = this.ruleSet.getFixableRules()
            
        var fixableRegexDiagnostics = <RegexMatchDiagnostic[]> context.diagnostics.filter(
            (diagnostic) => {
                return diagnostic.source == DiagnosticCollectionName  
                        && diagnostic instanceof RegexMatchDiagnostic
                        && allFixableMatchingRules.includes(diagnostic.rule) 
                        && diagnostic.range.intersection(selection_range);
            }
        );
            
        if (fixableRegexDiagnostics) {
            dryerLintLog(`There are ${fixableRegexDiagnostics.length} diagnostics in the selection.`)
        } else {
            // No relevant diagnostics found.
            dryerLintLog('No fixable diagnostics found in selection.')
            return []
        }

        // For each diagnostic in the selection that has a fix, create a quick action.
        var actions = fixableRegexDiagnostics.flatMap(
            (diagnostic: RegexMatchDiagnostic) => {
                // selection_range.
                const edits = generateTextEditFixes([diagnostic]);
                if (edits.length === 0) { 
                    dryerLintLog(`No edits for ${diagnostic.message}.`)
                    return []; 
                }

                // Create human-readable label that is shown in quick-fix menu.
                var actionLabel: string = `Fix: "${diagnostic.message}" (Dryer Lint)`;
                const action = new vscode.CodeAction(actionLabel, vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                action.edit.set(document.uri, edits);
                action.isPreferred = true;
                dryerLintLog(`Created an action "${action.title}" for "${diagnostic.message}".`)
                return action
            }
        )
        const run_time = Date.now() - start_time;
        if (actions) {
            dryerLintLog(`Created list of ${actions.length} fix CodeAction in ${run_time} ms: [${actions?.flatMap(action => "\n\t" + action.title)}\n].`)
        }
        return actions;
    }
}

class FixAllProvider implements vscode.CodeActionProvider
{
    private ruleSet;
    public constructor(ruleSet: RuleSet) {
        this.ruleSet = ruleSet;
     }

    provideCodeActions(
        document: vscode.TextDocument,
        selection_range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const start_time = Date.now();

        if (!this.ruleSet.doesMatchDocument(document)) {
            return []
        }
        
        const allFixableMatchingRules: Rule[] = this.ruleSet.getFixableRules()
            
        var fixableRegexDiagnostics = <RegexMatchDiagnostic[]> context.diagnostics.filter(
            (diagnostic) => {
                return diagnostic.source == DiagnosticCollectionName  
                        && diagnostic instanceof RegexMatchDiagnostic
                        && allFixableMatchingRules.includes(diagnostic.rule) 
                        && diagnostic.range.intersection(selection_range);
            }
        );
            
        // Print a message for debugging.
        fixableRegexDiagnostics.forEach(
            (diagnostic) => {
                dryerLintLog(`A diagnostic is active at the selected text: ${diagnostic}`)
            }
        )

        dryerLintLog(`There are ${fixableRegexDiagnostics.length} diagnostics in the selection with ${fixableRegexDiagnostics.length} fixable.}`)
        if (!fixableRegexDiagnostics) {
            // No relevant diagnostics found.
            dryerLintLog('No fixable diagnostics found in selection.')
            return []
        }
        
        // Create a list of all the rules that 1) are violated in the current selection and 2) have "fix"es defined.
        var fixablesRules: Rule[] = fixableRegexDiagnostics.flatMap(
                                                                (diagnostic) => diagnostic.rule
                                                            );
        // Remove non-unique values
        var fixablesRules = [...new Set(fixablesRules)]

        // Create one "Fix All" action for each rule.
        var n_rulesWithOnlyOneEdit = 0;
        const actions: vscode.CodeAction[] = fixablesRules.flatMap(
            (rule: Rule) => {
                const edits: vscode.TextEdit[] 
                        = generateTextEditFixes(
                            fixableRegexDiagnostics.filter(diagnostic => diagnostic.rule === rule)
                        );
                
                // If there two or more edits, then we create a "fix all" item. 
                // Otherwise, we are just cluttering the menu.
                if (edits.length <= 2) {
                    if (edits.length == 1) n_rulesWithOnlyOneEdit++ ;
                    return []
                }
                // Create human-readable label that is shown in quick-fix menu.
                var actionLabel: string =`Fix all (x${edits.length}): "${rule.name}" (Dryer Lint)`;
                const quickFixAllAction = new vscode.CodeAction(actionLabel, vscode.CodeActionKind.QuickFix);
                quickFixAllAction.edit = new vscode.WorkspaceEdit();
                quickFixAllAction.edit.set(document.uri, edits);
                dryerLintLog(`Created list of ${edits.length} edits for "Fix All" action: [${edits.flatMap(edit => "\n\t" + edit.newText)}\n].`)
                return quickFixAllAction
            }
        )

        const run_time = Date.now() - start_time;
        dryerLintLog(`Created ${actions.length} "Fix All" actions for ${this.ruleSet} in ${run_time} ms: [${actions?.flatMap(action => "\n\t" + action.title)}\n]. Skipped ${n_rulesWithOnlyOneEdit} rules that had only 1 edit.`)
        return actions
    }
}

function generateTextEditFixes(diagnostics: RegexMatchDiagnostic[]): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    for (const diagnostic of diagnostics) {
        if (diagnostic.fix === undefined) {
            continue;   
        }
        edits.push(new vscode.TextEdit(diagnostic.range, diagnostic.fix));
    }
    return edits;
}
