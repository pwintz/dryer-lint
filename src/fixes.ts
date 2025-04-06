import * as vscode from 'vscode';
import { DiagnosticCollectionName, RegexMatchDiagnostic } from './diagnostics';
import Rule, { ConfigSectionName, RuleSet, RuleSetsConfigName } from './rule';
import { dryerLintLog } from './extension'
import path = require('path');

export default function activateFixes(context: vscode.ExtensionContext) {
    vscode.workspace.onDidChangeConfiguration(event => {
        // When the user changes the list of rules, register all of the current fixes.
        if (event.affectsConfiguration(RuleSetsConfigName) 
            || event.affectsConfiguration(ConfigSectionName)) {
                refreshFixProviders(context);
            }
    });

    refreshFixProviders(context);
}

const codeActionProviderDisposables: vscode.Disposable[] = []
function refreshFixProviders(context: vscode.ExtensionContext){
    
    dryerLintLog(`====== Start refreshFixProviders(): context.subscriptions.length: ${context.subscriptions.length} ======`)
    let codeActionProviderDisposable;
    while (codeActionProviderDisposable = codeActionProviderDisposables.pop()){
        var index = context.subscriptions.indexOf(codeActionProviderDisposable)
        context.subscriptions.splice(index)
        codeActionProviderDisposable.dispose();
    }
    dryerLintLog(`After popping: context.subscriptions.length: ${context.subscriptions.length}`)

    const ruleSets: RuleSet[] = RuleSet.getAllRules();
    const actionProviderDisposables = ruleSets.flatMap(
        ruleSet => {
            const singleFixProvider = new SingleFixProvider(ruleSet)
            const fixAllProvider    = new FixAllProvider(ruleSet)
            const docFilter: vscode.DocumentFilter[] = ruleSet.getDocumentLanguageFilter()
            return [
                vscode.languages.registerCodeActionsProvider(docFilter, singleFixProvider, 
                                                {
                                                    providedCodeActionKinds: [
                                                        vscode.CodeActionKind.QuickFix
                                                    ]
                                                }), 
                vscode.languages.registerCodeActionsProvider(docFilter, fixAllProvider, {
                                                providedCodeActionKinds: [
                                                    vscode.CodeActionKind.SourceFixAll,
                                                    vscode.CodeActionKind.QuickFix // <- This is needed for the "Fix All" options to be shown in the quick fix menu.
                                                ]
                                            })
           ]
        }
    )
    dryerLintLog(`Created ${actionProviderDisposables.length} code action providers.`)

    codeActionProviderDisposables.push(...actionProviderDisposables)
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
        dryerLintLog(`===== Start of SingleFixProvider.provideCodeActions() for ${this.ruleSet} =====`)

        if (!this.ruleSet.doesMatchDocument(document)) {
            return []
        }

        const allFixableMatchingRules: Rule[] = this.ruleSet.getFixableRules()
            
        var regexDiagnostics = <RegexMatchDiagnostic[]> context.diagnostics.filter(
                                            diagnostic => diagnostic instanceof RegexMatchDiagnostic
         );
        var regexDiagnosticsInSelection = regexDiagnostics.filter(
            (diagnostic) => diagnostic.range.intersection(selection_range) !== undefined
        );
        var fixableRegexDiagnostics = regexDiagnosticsInSelection.filter(
            (diagnostic) => {
                return allFixableMatchingRules.includes(diagnostic.rule);
            }
        );
          
        dryerLintLog(`There are ${regexDiagnostics.length} regex diagnostics with ${regexDiagnosticsInSelection.length} in the selection, and ${fixableRegexDiagnostics.length} fixable in the selection for ${this.ruleSet}.}`)
        dryerLintLog(`regexDiagnostics: [\n\t${regexDiagnostics.join('\n\t')}\n]\nregexDiagnosticsInSelection: [\n\t${regexDiagnosticsInSelection.join('\n\t')}\n]\nfixableRegexDiagnostics: [\n\t${fixableRegexDiagnostics.join('\n\t')}\n]\n`)
        
        if (fixableRegexDiagnostics.length == 0) {
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
                    dryerLintLog(`No edits for ${diagnostic.message}.`);
                    return []; 
                }

                // Create human-readable label that is shown in quick-fix menu.
                var actionLabel: string = `Fix: "${diagnostic.message}" (Dryer Lint)`;
                const action = new vscode.CodeAction(actionLabel, vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                action.edit.set(document.uri, edits);
                action.isPreferred = true;
                dryerLintLog(`Created an action "${action.title}" for "${diagnostic.message}".`);
                return action;
            }
        );
        const run_time = Date.now() - start_time;
        if (actions) {
            dryerLintLog(`Created list of ${actions.length} fix CodeAction in ${run_time} ms: [${actions?.flatMap(action => "\n\t" + action.title)}\n].`);
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
        dryerLintLog(`===== Start of FixAllProvider.provideCodeActions() for ${this.ruleSet} =====`);

        if (!this.ruleSet.doesMatchDocument(document)) {
            dryerLintLog(`The document "${path.basename(document.fileName)}" does not match this rule set: ${this.ruleSet}`);
            return [];
        }
        
        const allFixableMatchingRules: Rule[] = this.ruleSet.getFixableRules();
            
        var regexDiagnostics = <RegexMatchDiagnostic[]> context.diagnostics.filter(
            (diagnostic) => diagnostic instanceof RegexMatchDiagnostic
        );
        var regexDiagnosticsInSelection = regexDiagnostics.filter(
            (diagnostic) => diagnostic.range.intersection(selection_range) !== undefined
        );
        var fixableRegexDiagnostics = regexDiagnosticsInSelection.filter(
            (diagnostic) => allFixableMatchingRules.includes(diagnostic.rule)
        );
            
        // Print a message for debugging.
        fixableRegexDiagnostics.forEach(
            (diagnostic) => dryerLintLog(`A diagnostic is active at the selected text: ${diagnostic}`)
        );

        dryerLintLog(`There are ${regexDiagnostics.length} regex diagnostics with ${regexDiagnosticsInSelection.length} in the selection, and ${fixableRegexDiagnostics.length} fixable in the selection for ${this.ruleSet}.}`);
        dryerLintLog(`regexDiagnostics: [\n\t${regexDiagnostics.join('\n\t')}\n]\nregexDiagnosticsInSelection: [\n\t${regexDiagnosticsInSelection.join('\n\t')}\n]\nfixableRegexDiagnostics: [\n\t${fixableRegexDiagnostics.join('\n\t')}\n]\n`);

        if (fixableRegexDiagnostics.length === 0) {
            // No relevant diagnostics found.
            dryerLintLog('No fixable diagnostics found in selection.')
            return []
        }
        
        // Create a list of all the rules that 1) are violated in the current selection and 2) have "fix"es defined.
        var fixablesRules: Rule[] = fixableRegexDiagnostics.flatMap(
                                                                (diagnostic) => diagnostic.rule
                                                            );
        // Remove non-unique values
        var fixablesRules = [...new Set(fixablesRules)];

        // Create one "Fix All" action for each rule.
        var n_rulesWithOnlyOneEdit = 0;
        const actions: vscode.CodeAction[] = fixablesRules.flatMap(
            (rule: Rule) => {
                const edits: vscode.TextEdit[] 
                        = generateTextEditFixes(
                            fixableRegexDiagnostics.filter(diagnostic => diagnostic.rule === rule)
                        );

                var sortedEdits = edits.sort(
                    (left, right) => {
                        // if(left.range.start.isBefore(right.range.start)) {
                        //     return -1
                        // }
                        if (left.range.start.line == right.range.start.line){
                            return left.range.start.character - right.range.start.character
                        }
                        return left.range.start.line - right.range.start.line;
                    } 
                )
                
                var prevEditEnd: vscode.Position | undefined = undefined;
                const nonOverlappingEdits = sortedEdits.filter(
                    (edit) => {
                        if (prevEditEnd === undefined) {
                            return true
                        }
                        var isAfter = edit.range.start.isAfterOrEqual(prevEditEnd);
                        if (isAfter) {
                            prevEditEnd = edit.range.end;
                            return true
                        } else {
                            return false
                        }
                    }
                )

                // If there two or more non-overlapping edits, then we create a "fix all" item. 
                // Otherwise, we are just cluttering the menu.
                if (nonOverlappingEdits.length < 2) {
                    if (nonOverlappingEdits.length === 1) {
                        n_rulesWithOnlyOneEdit++ ;
                        dryerLintLog(`Not creating a "Fix All" action for ${rule} because there was only 1 non-overlapping edit out of ${edits.length} total.`);
                    }
                    return []
                }

                dryerLintLog(`Created list of ${edits.length} edits for "Fix All" actions for ${rule}: [${edits.flatMap(edit => "\n\t" + edit.newText + ", start: " + edit.range.start.line + ":" + edit.range.start.character + ", end: " + edit.range.end.line + ":" + edit.range.end.character) },\n].`)
                dryerLintLog(`Reduced to list of ${nonOverlappingEdits.length} non-overlapping edits for "Fix All" action: [${nonOverlappingEdits.flatMap(edit => "\n\t" + edit.newText + ", start: " + edit.range.start.line + ":" + edit.range.start.character + ", end: " + edit.range.end.line + ":" + edit.range.end.character) },\n].`)
                
                // Create human-readable label that is shown in quick-fix menu.
                if (nonOverlappingEdits.length < edits.length) {
                    var actionLabel: string =`Fix ${nonOverlappingEdits.length} of ${edits.length}: "${rule.name}" (Dryer Lint)`;
                } else {
                    var actionLabel: string =`Fix all (x${edits.length}): "${rule.name}" (Dryer Lint)`;
                }
                const quickFixAllAction = new vscode.CodeAction(actionLabel, vscode.CodeActionKind.QuickFix);
                quickFixAllAction.edit = new vscode.WorkspaceEdit();
                quickFixAllAction.edit.set(document.uri, nonOverlappingEdits);
                return quickFixAllAction
            }
        );

        const run_time = Date.now() - start_time;
        dryerLintLog(`Created ${actions.length} "Fix All" actions for ${this.ruleSet} in ${run_time} ms: [${actions?.flatMap(action => "\n\t" + action.title)}\n]. Skipped ${n_rulesWithOnlyOneEdit} rules that had only 1 edit.`);
        return actions;
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
