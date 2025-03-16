import * as vscode from 'vscode';
import Rule from './rule';
import { sortedIndex } from './util';
import * as util from './util';
import { dryerLintLog } from './extension'

// The value of DiagnosticCollectionName is used as the "source" property on Diagnostic objects.
export const DiagnosticCollectionName = 'Dryer Lint';

export class RegexMatchDiagnostic extends vscode.Diagnostic
{
    rule: Rule;
    regexMatch: RegExpMatchArray;
    document: vscode.TextDocument;

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

    constructor(rule: Rule, regexMatch: RegExpMatchArray, document: vscode.TextDocument, range: vscode.Range) {
        var message = rule.message
        dryerLintLog(`RegexMatch: ${regexMatch}, length: ${regexMatch.length}, entries: ${regexMatch.entries()}.`)
        
        // Replace "$1" in the message with the first capture group, "$2" with the second and so on.
        message = message.replace(/\$(\d+)/g, (_, num) => regexMatch[Number(num)] || `<regex capture group ${num} not found>`);

        // N.B. The range of text used to match a regex might be larger than the range provided in "ramge" because regex's can use lookaheads and lookbehinds that are not included in the match string.

        super(range, message, rule.severityCode);
        this.rule = rule;
        this.regexMatch = regexMatch;
        this.code = rule.name;
        this.source = DiagnosticCollectionName;
        this.document = document;
    }

    toString() {
        // Create a string representation. 
        // The start, end, and character properties of range use zero indexing, so we add one to get 1-based indexing. 
        // This allows use to click on the location as printed in the terminal to open the diagnostic location in the code.
        return `RegexMatchDiagnostic{"${this.code}", message: "${this.message}" at ${this.document.fileName}:${this.range.start.line+1}:${this.range.start.character+1} to ${this.range.end.line+1}:${this.range.end.character+1}. Has fix? ${this.hasFix}}`
    }

    public get hasFix() : boolean {
        return this.rule.fix !== undefined
    }
    
}

export default function activateDiagnostics(context: vscode.ExtensionContext): void {
    const diagnostics = vscode.languages.createDiagnosticCollection(DiagnosticCollectionName);
    context.subscriptions.push(diagnostics);

    // Update the diagnostics whenever the a document becomes active.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            // 'editor' is the currently active editor or undefined. The active editor is the one that currently has focus or, when none has focus, the one that has changed input most recently.
            if (editor) { 
                dryerLintLog(`Refresing diagnostics for "${editor.document.fileName}" because editor became active.`)
                refreshDiagnostics(editor.document, diagnostics); 
            }
        })
    );

    // Update the diagnostics whenever the text of a document changes.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event =>
            {
                if (event.document.fileName.startsWith('extension-output-')) {
                    // Surprisingly, onDidChangeTextDocument is triggered with the extension output panel changes. 
                    // This creates an infinite loop if we print anything to the consoue during refreshDiagnostics (spoiler: we do). 
                    // This if/return block stops this from happening.
                    return
                }
                dryerLintLog(`Refresing diagnostics for "${event.document.fileName}" because document changed.`)
                return refreshDiagnostics(event.document, diagnostics);
            })
    );

    // If there is an active text editor, then immediately refresh the diagnostics to include the dryerLint diagnositics.
    // This should occur after subscribing onDidChangeActiveTextEditor, in case an editor becomes active after subscribing, but before executing these lines of code.
    if (vscode.window.activeTextEditor) {
        dryerLintLog(`Refresing diagnostics for "${vscode.window.activeTextEditor.document.fileName}" during initial activation.`)
        refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics);
    }
}

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
    // If the current document is not in the workspace, then don't update diagnostics.
    // ?? Are we not able apply linting to non-workspace documents? 
    if (!vscode.workspace.getWorkspaceFolder(document.uri)) return;

    const start_time = Date.now();

    const rules = Rule.all[document.languageId];
    if (rules) {
        dryerLintLog(`Refreshing diagnostics for ${rules.length} rules applied to ${document.lineCount} lines in\n\t"${document.fileName}".`)
    } else {
        dryerLintLog(`No Dryer Lint rules found for "${document.fileName}", which has language=${document.languageId}.`)
    }

    // Track whether dryerLint is enabled or disabled via comments.
    var dryerLintEnabled = true;

    var commentChar = util.getLineCommentChar(document);
    if (!commentChar) {
        commentChar = "(?://|#)"
    }
    const escapedCommentChar = commentChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dryerLintCommentConfigRegex = new RegExp('^[ \\t]*'+ escapedCommentChar + '[ \t]*dryer-lint:[ \\t]*(?<config>.*?)[ \\t]*$', 'mi');
    // dryerLintLog("RegEx for finding Dryer Lint config comments: " + dryerLintCommentConfigRegex.source)

    // A list of all of diagnostics we create for the current document. 
    // They are applied at the end of the function by calling diagnostics.set(document.uri, diagnosticList);
    const diagnosticList: RegexMatchDiagnostic[] = [];

    if (rules?.length) {// If there are any rules in the current language...
        const numLines = document.lineCount;

        for (const rule of rules) { // Iterate over all of the rules
            dryerLintLog(`Checking rule "${rule.name}."`)
            const rule_start_time = Date.now();

            for(var line=0; line < numLines; line++) {
                // Construct a text range that includes the current line and the lines afteward up to a total of "maxLines" (or the end of the file).
                const endLine = Math.min(line + rule.maxLines, numLines)
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
                    continue; // Skip line.
                }

                let array: RegExpExecArray | null;
                while (array = rule.regex.exec(text)) {// Search for matches until we find no more.
                    const range = rangeFromMatch(document, textRange, array);
                    const regexDiagnostic = new RegexMatchDiagnostic(rule, array, document, range);
                    diagnosticList.push(regexDiagnostic);
                }
            }
            
            dryerLintLog(`Checking rule took ${Date.now() - rule_start_time} ms: "${rule.name}"`)
        }// End of for-loop over "rules"

        // Display the time required to check in the log and status bar. 
        const run_time = Date.now() - start_time;
        dryerLintLog(`Finished refreshing Dryer Lint diagnostics in ${run_time} ms for ${rules?.length} rules applied to ${document.lineCount} lines in\n${document.fileName}.`)
        vscode.window.setStatusBarMessage(`Dryer Lint refresh: ${run_time} ms`, 2*1000);
    }

    diagnostics.set(document.uri, diagnosticList);
    
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
