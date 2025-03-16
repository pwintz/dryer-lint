import * as vscode from 'vscode';
import { DiagnosticCollectionName, RegexMatchDiagnostic } from './diagnostics';
import Rule, { ConfigSectionName, FixType } from './rule';
import { sortedIndex } from './util';
import { dryerLintLog } from './extension'

type Fix = {
    group: string,
    language: string,
    regex: RegExp,
    // TODO: Create a UUID instead of using the pattern. The current code might break if patterns are not unique!
    ruleId: string, // The "pattern" string provided by the user. 
    string: string, // The "fix" string provided by the user
    type: FixType
};

const MaxFixIters = 64;

const disposableCache: {
    [language: string]: {
        count: number,
        disposables: vscode.Disposable[]
    }
} = {};

export default function activateFixes(context: vscode.ExtensionContext) {
    const fixes = getFixes();
    registerFixes(context, fixes);

    vscode.workspace.onDidChangeConfiguration(event => {
        // When the user changes the list of rules, register all of the current fixes.
        if (event.affectsConfiguration(ConfigSectionName)) {
            const newFixes = getFixes();

            for (const [i, fix] of fixes.entries()) {
                const j = newFixes.findIndex(({ ruleId }) => ruleId === fix.ruleId);
                if (j === -1) {// Not found
                    deregisterFix(context, fix);
                    fixes.splice(i, 1);
                } else {
                    Object.assign(fix, newFixes[j]);
                    newFixes.splice(j, 1);
                }
            }

            fixes.push(...newFixes);

            registerFixes(context, newFixes);
        }
    });
}

function getFixes(): Fix[] {
    return Object.values(Rule.all)
        .flat()
        // filter any rules that do not define fixes.
        .filter(rule => rule?.fix !== undefined)
        .map(rule => ({
            group: rule!.name,
            language: rule!.language,
            regex: new RegExp(rule!.regex),
            ruleId: rule!.id,  // Contains the regex pattern.
            string: rule!.fix!,// The "fix" string provided by the user
            type: rule!.fixType
        }));
}

function registerFixes(context: vscode.ExtensionContext, fixes: Fix[]) {
    for (const fix of fixes) {
        if (disposableCache[fix.language]) {
            disposableCache[fix.language].count += 1;
        } else {
            const disposables = [
                vscode.languages.registerCodeActionsProvider(fix.language, new QuickFixProvider(fixes), {
                    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
                }),
                vscode.languages.registerCodeActionsProvider(fix.language, new FixAllProvider(fixes), {
                    providedCodeActionKinds: [
                        vscode.CodeActionKind.SourceFixAll,
                        vscode.CodeActionKind.QuickFix // <- This seems out of place, but let's test.
                    ]
                })
            ];

            context.subscriptions.push(...disposables);

            disposableCache[fix.language] = {
                count: 1,
                disposables
            };
        }
    }
}

function deregisterFix(context: vscode.ExtensionContext, fix: Fix) {
    const disposeData = disposableCache[fix.language];
    if ((disposeData.count -= 1) <= 0) {
        disposeData.disposables.forEach(disposable => disposable.dispose());

        for (const disposable of disposeData.disposables) {
            const index = context.subscriptions.indexOf(disposable);
            context.subscriptions.splice(index, 1);
        }

        delete disposableCache[fix.language];
    }
}

class QuickFixProvider implements vscode.CodeActionProvider
{
    public constructor(readonly fixes: Fix[]) { }

    provideCodeActions(
        document: vscode.TextDocument,
        selection_range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const start_time = Date.now();
            
        var diagnostics = <RegexMatchDiagnostic[]> context.diagnostics;
        var diagnosticsInSelection: RegexMatchDiagnostic[] = diagnostics.filter(
            (diagnostic) => {
                return diagnostic.range.intersection(selection_range);
            }
        ).filter(
            (diagnostic) => {
                return diagnostic.source == DiagnosticCollectionName  
                       && diagnostic instanceof RegexMatchDiagnostic
            }
        )

        // const fixes_in_selection = this.fixes.filter(fix => fix.group === diagnostic.code);
        diagnosticsInSelection.forEach(
            (diagnostic) => {
                dryerLintLog(`A diagnostic is active at the selected text: ${diagnostic}`)
            }
        )

        var fixableDiagnosticsInSelect = diagnosticsInSelection.filter(
            // If the diagnostic does not have a fix defined, then continue to the next diagnostic. 
            (diagnostic) => diagnostic.hasFix
        )

        dryerLintLog(`There are ${diagnosticsInSelection.length} diagnostics in the selection with ${fixableDiagnosticsInSelect.length} fixable.}`)
        if (!fixableDiagnosticsInSelect) {
            // No relevant diagnostics found.
            dryerLintLog('No fixable diagnostics found in selection.')
            return []
        }

        // For each diagnostic in the selection that has a fix, create a quick action.
        var actions = fixableDiagnosticsInSelect.flatMap(
            (diagnostic: RegexMatchDiagnostic) => {
                // selection_range.
                const edits = generateTextEditFixes(document, [diagnostic], this.fixes);
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
    public constructor(readonly fixes: Fix[]) { }

    provideCodeActions(
            document: vscode.TextDocument,
            selection_range: vscode.Range,
            context: vscode.CodeActionContext): vscode.CodeAction[] {
        var regexDiagnostics = <RegexMatchDiagnostic[]> context.diagnostics.filter(
            (diagnostic) => {
                return diagnostic.source == DiagnosticCollectionName  
                        && diagnostic instanceof RegexMatchDiagnostic
            }
        );
        var fixableRegexDiagnostics = regexDiagnostics.filter(
            (diagnostic) => {
                return diagnostic.rule.fix !== undefined;
            }
        );
        var fixableDiagnosticsInSelection: RegexMatchDiagnostic[] = fixableRegexDiagnostics.filter(
            (diagnostic) => {
                return diagnostic.range.intersection(selection_range);
            }
        );
        
        // Create a list of all the rules that 1) are violated in the current selection and 2) have "fix"es defined.
        var fixableRulesInSelection: Rule[] = fixableDiagnosticsInSelection.flatMap(
            (diagnostic) => {
                return diagnostic.rule
            }
        );
        var uniqueFixableRulesInSelection = [...new Set(fixableRulesInSelection)]

        // Create one "Fix All" action for each rule.
        var listOfFixAllActions: vscode.CodeAction[] = []
        uniqueFixableRulesInSelection.forEach(
            (rule: Rule) => {
                // const fixAllAction      = new vscode.CodeAction('Apply all Dryer Lint fixes (quick fix)', vscode.CodeActionKind.SourceFixAll);
                // fixAllAction.edit = new vscode.WorkspaceEdit();

                // Create human-readable label that is shown in quick-fix menu.
                const edits = generateTextEditFixes(document, fixableDiagnosticsInSelection.filter(diag => diag.rule === rule), this.fixes);
                
                if (edits.length > 1) {
                    // If there two or more edits, then we create a "fix all" item. 
                    // Otherwise, we are just cluttering the menu.
                    var actionLabel: string =`Fix all (x${edits.length}): "${rule.name}" (Dryer Lint)`;
                    const quickFixAllAction = new vscode.CodeAction(actionLabel, vscode.CodeActionKind.QuickFix);
                    quickFixAllAction.edit = new vscode.WorkspaceEdit();
                    quickFixAllAction.edit.set(document.uri, edits);
                    listOfFixAllActions.push(quickFixAllAction)
                    if (edits) {
                        dryerLintLog(`Created list of ${edits.length} edits for "Fix All" action: [${edits.flatMap(edit => "\n\t" + edit.newText)}\n].`)
                    }
                }
            }
        )

        dryerLintLog(`Created ${listOfFixAllActions.length} "Fix All" actions.`)
        return listOfFixAllActions
    }
}

function generateTextEditFixes(
        document: vscode.TextDocument,
        diagnostics: RegexMatchDiagnostic[],
        fixes: Fix[]): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    for (const diagnostic of diagnostics) {
        
        if (diagnostic.rule.fix === undefined) {
            dryerLintLog('diagnostic.rule.fix is not defined!')
            continue;   
        }

        let fixedText: string = diagnostic.rule.fix.replace(/\$(\d+)/g, (_, num) => diagnostic.regexMatch[Number(num)] || '' );

        if (fixedText !== undefined) {
            edits.push(new vscode.TextEdit(diagnostic.range, fixedText));
        } else {
            dryerLintLog(`FixedText is undefined for "${diagnostic.message}"!`)

        }
    }
    if (!edits) {
        dryerLintLog(`No edits generated!`)
    }
    return edits;
}


function applyReorderFix(text: string, fix: Fix): string | undefined {
    const sorter: [number, string][] = [];
    const bucket: [string, number][] = [];

    let array: RegExpExecArray | null;
    let doFix = false;
    let count = 0;
    while (array = fix.regex.exec(text)) {
        const lastIndex = fix.regex.lastIndex;
        const match = array[0];
        const token = match.replace(fix.regex, fix.string);
        fix.regex.lastIndex = lastIndex;

        const tuple: [number, string] = [count, token];
        const index = fix.type === 'reorder_asc'
            ? sortedIndex(sorter, tuple, ([_i, a], [_j, b]) => a <= b)
            : sortedIndex(sorter, tuple, ([_i, a], [_j, b]) => a >= b);

        sorter.splice(index, 0, tuple);
        bucket.push([match, array.index]);

        doFix = doFix || count !== index;
        count += 1;
    }

    if (!doFix) { return undefined; }

    let result = '';
    let offset = 0;
    for (const [i, [j]] of sorter.entries()) {
        const [match0, index0] = bucket[i];
        const [match1] = bucket[j];
        const length0 = match0.length;
        let part = text.substring(offset, index0 + length0);
        part = part.replace(match0, match1);
        result += part;
        offset = index0 + length0;
    }
    result += text.substr(offset);

    return result;
}
