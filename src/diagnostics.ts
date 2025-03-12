import * as vscode from 'vscode';
import Rule from './rule';
import { sortedIndex } from './util';
import * as util from './util';
import { dryerLintLog } from './extension'

// The value of DiagnosticCollectionName is used as the "source" property on Diagnostic objects.
export const DiagnosticCollectionName = 'Dryer Lint';

export class Diagnostic extends vscode.Diagnostic
{
    /**
	 * Get the union of the diagnostic's range and any other ranges that are listed in the relatedInformation property
	 */
    public get effectiveRange(): vscode.Range {
        if (!this.relatedInformation) {
            return this.range;
        }
        // If there is relatedInformation given for the diagnostic, then append
        return this.relatedInformation.reduce(
            (range, info) => range.union(info.location.range), 
            this.range
        )
    }
}

export default function activateDiagnostics(context: vscode.ExtensionContext): void {
    const diagnostics = vscode.languages.createDiagnosticCollection(DiagnosticCollectionName);
    context.subscriptions.push(diagnostics);

    // If there is an active text editor, then immediately refresh the diagnostics to include the dryerLint diagnositics.
    // TODO: This should occur after subscribing onDidChangeActiveTextEditor, in case an editor becomes active between these actions.
    if (vscode.window.activeTextEditor) {
        refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics);
    }

    // Update the diagnostics whenever the a document becomes active.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) { refreshDiagnostics(editor.document, diagnostics); }
        })
    );

    // Update the diagnostics whenever the text of a document changes.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event =>
            refreshDiagnostics(event.document, diagnostics))
    );
}

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
    // If the current document is not in the workspace, then don't update diagnostics.
    // ?? Are we not able apply linting to non-workspace documents? 
    if (!vscode.workspace.getWorkspaceFolder(document.uri)) return;

    const start_time = Date.now();

    const rules = Rule.all[document.languageId];
    if (rules) {
        dryerLintLog(`Refreshing Dryer Lint diagnostics for ${rules.length} rules applied to ${document.lineCount} lines in\n${document.fileName}.`)
    } else {
        dryerLintLog(`No Dryer Lint rules found for ${document.fileName}, which has language=${document.languageId}.`)
    }

    // Track whether dryerLint is enabled or disabled via comments.
    var dryerLintEnabled = true;

    var commentChar = util.getLineCommentChar(document);
    if (!commentChar) {
        commentChar = "(?://|#)"
    }
    const escapedCommentChar = commentChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dryerLintCommentConfigRegex = new RegExp('^[ \\t]*'+ escapedCommentChar + '[ \t]*dryer-lint:[ \\t]*(?<config>.*?)[ \\t]*$', 'mi');
    dryerLintLog("RegEx for finding Dryer Lint config comments: " + dryerLintCommentConfigRegex.source)

    const diagnosticList: Diagnostic[] = [];

    if (rules?.length) {// If there are any rules in the current language...
        const numLines = document.lineCount;

        for (const rule of rules) { // Iterate over all of the rules
            const maxLines = rule.maxLines || numLines;
            dryerLintLog(`Checking rule "${rule.name}."`)
            const rule_start_time = Date.now();

            for(var line=0; line < numLines; line++) {
                const endLine = Math.min(line + maxLines, numLines)
                let textRange = document.lineAt(line)
                                        .range
                                        .union(document
                                                .lineAt(endLine - 1) 
                                                .rangeIncludingLineBreak
                                        );

                const text = document.getText(textRange);

                // Check if the text is enabling or disabling dryerLint.
                // TODO: Move the code for enabling or disabling dryerLint via comments into a dedicated function. 
                // TODO: It would also be a good idea to sweep through the file once and find all of the config comments, and store the results, instead of checking repeatedly.
                var commentConfigMatch = text.match(dryerLintCommentConfigRegex);
                if (commentConfigMatch?.groups) {
                    // If the config text is "disable", "disabled", or "enabled=false" (with optional spaces around the equal sign), then disable dryerLint.
                    if (commentConfigMatch.groups.config.match(/(?:disable[d]?|enable[d]?[ \t]*=[ \t]*false)/)){
                        dryerLintEnabled = false;
                        dryerLintLog(`Disabled Dryer Lint in \"${document.fileName}\" at line=${line} because of comment config "${commentConfigMatch.groups.config}".`)
                    } else if (commentConfigMatch.groups.config.match(/enable[d]?(?:[ \t]*=[ \t]*true)?/)) {
                        // If the config text is "enable", "enabled", or "enabled=true" (with optional spaces around the equal sign), then reenable dryerLint.
                        dryerLintEnabled = true;
                        dryerLintLog(`Enabled Dryer Lint checking starting in \"${document.fileName}\" at line=${line} because of comment config "${commentConfigMatch.groups.config}".`)
                    } else {
                        vscode.window.showErrorMessage(`Dryer Lint: Invalid Config Comment in \"${document.fileName}\" at line=${line}: "${commentConfigMatch.groups.config}"`)
                    }
                }
                if (!dryerLintEnabled) {
                    continue; // Go to the next line.
                }

                let array: RegExpExecArray | null;
                if (rule.fixType === 'replace') {
                    while (array = rule.regex.exec(text)) {
                        // Construct diagnostic message.
                        var message = rule.message
                        for (var i = 1; i < array.length; i++) {
                            if (array){
                                // Replace "$1" in the message with the first capture group, "$2" with the second and so on.
                                message = message.replace(/\$(\d+)/g, (_, num) => array?.[Number(num)] || `<regex capture group ${num} not found>`);
                            }
                        }

                        const range = rangeFromMatch(document, textRange, array);
                        const entry = mergeDiagnostic(diagnosticList, document, range, rule)
                            ?? createDiagnostic(diagnostics.name, range, rule, message);
                        if (!diagnosticList.includes(entry)) {
                            diagnosticList.push(entry);
                        }
                        dryerLintLog(`The rule "${rule.name}" with message "${message}" matched "${array}".`);
                    }
                } else { // Otherwise, fix type is 'reorder_asc' or 'reorder_desc'
                    const sorter: string[] = [];

                    let entry: Diagnostic | undefined;
                    let isBad = false;
                    let count = 0;
                    while (array = rule.regex.exec(text)) {
                        const range = rangeFromMatch(document, textRange, array);
                        if (!entry) {
                            entry = mergeDiagnostic(diagnosticList, document, range, rule)
                                ?? createDiagnostic(diagnostics.name, range, rule, rule.message);
                        } else {
                            addRelatedInfo(entry, document, range);
                        }

                        if (!isBad) {
                            const lastIndex = rule.regex.lastIndex;
                            const match = array[0];
                            const token = match.replace(rule.regex, rule.fix!);
                            rule.regex.lastIndex = lastIndex;
                            const index = rule.fixType === 'reorder_asc'
                                ? sortedIndex(sorter, token, (a, b) => a <= b)
                                : sortedIndex(sorter, token, (a, b) => a >= b);
                            sorter.splice(index, 0, token);

                            isBad = count !== index;
                            count += 1;
                        }
                    }

                    if (isBad && !diagnosticList.includes(entry!)) {
                        diagnosticList.push(entry!);
                    }
                }

                if (textRange.end.line >= numLines - 1) { break; }
            }
            
            dryerLintLog(`Checking ${rule.name} took ${Date.now() - rule_start_time} ms`)
        }// End of for-loop over "rules"
        const run_time = Date.now() - start_time;
        dryerLintLog(`Finished refreshing Dryer Lint diagnostics in ${run_time} ms for ${rules?.length} rules applied to ${document.lineCount} lines in\n${document.fileName}.`)
        vscode.window.setStatusBarMessage(`Dryer Lint refresh: ${run_time} ms`, 2*1000);
    }

    diagnostics.set(document.uri, diagnosticList);
    
}

function mergeDiagnostic(
            diagnosticList: Diagnostic[],
            document: vscode.TextDocument,
            range: vscode.Range,
            rule: Rule): Diagnostic | undefined {
    let diagnostic = diagnosticList.find(diagnostic =>
        diagnostic.code === rule.name &&
        diagnostic.effectiveRange.intersection(range)
    );
    if (diagnostic) {
        if (diagnostic.range.intersection(range)) {
            diagnostic.range = diagnostic.range.union(range);
        } else {
            addRelatedInfo(diagnostic, document, range);
        }
    }
    return diagnostic;
}

function addRelatedInfo(diagnostic: Diagnostic, document: vscode.TextDocument, range: vscode.Range) {
    if (diagnostic.relatedInformation === undefined)
        diagnostic.relatedInformation = [];
    const info = diagnostic.relatedInformation.find(info =>
        info.location.range.intersection(range));
    if (info) {
        info.location.range = info.location.range.union(range);
    } else {
        diagnostic.relatedInformation.push({
            location: { uri: document.uri, range },
            message: 'related match here'
        });
    }
}

function createDiagnostic(source: string, range: vscode.Range, rule: Rule, message: string): Diagnostic {
    
    const diagnostic = new Diagnostic(range, message, rule.severityCode);
    diagnostic.source = source;
    diagnostic.code = rule.name;
    return diagnostic;
}

function rangeFromMatch(
            document: vscode.TextDocument,
            textRange: vscode.Range,
            matchArray: RegExpExecArray): vscode.Range {
    const matchStart = document.offsetAt(textRange.start) + matchArray.index;
    const matchLength = matchArray[0].length;
    const startPosition = document.positionAt(matchStart);
    const endPosition = document.positionAt(matchStart + matchLength);
    return new vscode.Range(startPosition, endPosition);
}
