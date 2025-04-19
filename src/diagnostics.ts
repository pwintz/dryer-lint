import * as vscode from 'vscode';
import Rule, { RuleSet } from './rule';
import * as util from './util';
import { dryerLintLog } from './extension';
import * as dryerLint from './extension';
import path = require('path');

// The value of DiagnosticCollectionName is used as the "source" property on Diagnostic objects.
export const DiagnosticCollectionName = 'Dryer Lint';
const DryerLintLogName = "pwintz.dryer-lint";

export class RegexMatchDiagnostic extends vscode.Diagnostic
{
    rule: Rule;
    regexMatch: RegExpMatchArray;
    document: vscode.TextDocument;
    // "fix" is a string generated by the rule to replace the matched text. 
    // If no "fix" is provided by the user, then fix=undefined.
    fix: string | undefined;

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
        );
    }

    constructor(rule: Rule, regexMatch: RegExpMatchArray, document: vscode.TextDocument, range: vscode.Range) {
        // Debugging print statement:
        // dryerLintLog(`RegexMatch: "${regexMatch}", length: ${regexMatch.length}, entries: ${regexMatch.entries()}.`)
        
        // Replace "$1" in the message with the first capture group, "$2" with the second and so on.
        // We must do this before calling super so that we can pass "message" to the superclass constructor.
        var message = rule.message.replace(/\$(\d+)/g, (_, num) => regexMatch[Number(num)] || `<regex capture group ${num} not found>`);

        var fix = rule.fix?.replace(/\$(\d+)/g, (_, num) => regexMatch[Number(num)] || '' );
        // const result = str.replace(regex, substitution);

        // N.B. The range of text used to match a regex might be larger than the range provided in "ramge" because regex's can use lookaheads and lookbehinds that are not included in the match string.

        super(range, message, rule.severityCode);
        this.rule = rule;
        this.regexMatch = regexMatch;
        this.fix = fix;
        this.code = rule.name;
        this.source = DiagnosticCollectionName;
        this.document = document;
    }

    toString() {
        // Create a string representation. 
        // The start, end, and character properties of range use zero indexing, so we add one to get 1-based indexing. 
        // This allows use to click on the location as printed in the terminal to open the diagnostic location in the code.
        return `RegexMatchDiagnostic{"${this.code}", message: "${this.message}" at ${this.document.fileName}:${this.range.start.line+1}:${this.range.start.character+1} to ${this.range.end.line+1}:${this.range.end.character+1}. Has fix? ${this.hasFix}}`;
    }

    public get hasFix() : boolean {
        return this.rule.fix !== undefined;
    }
    
}

const diagnosticsCollections = vscode.languages.createDiagnosticCollection(DiagnosticCollectionName);

export function getDiagnostics(document: vscode.TextDocument): RegexMatchDiagnostic[] {
    const diagnostics = diagnosticsCollections.get(document.uri);
    if (diagnostics) {
        return diagnostics as RegexMatchDiagnostic[];
    } else {
        return [];
    }
}

export default function activateDiagnostics(context: vscode.ExtensionContext): void {
    context.subscriptions.push(diagnosticsCollections);

    // Update the diagnostics whenever the a document becomes active.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            // 'editor' is the currently active editor or undefined. The active editor is the one that currently has focus or, when none has focus, the one that has changed input most recently.
            if (editor) { 
                tryRefreshDiagnostics(editor.document, diagnosticsCollections, "the editor became active");
            }
        })
    );
         
    // Update the diagnostics whenever the text of a document changes.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event =>
            {
                tryRefreshDiagnostics(event.document, diagnosticsCollections, "document changed");
            })
    );  

    // If there is an active text editor, then immediately refresh the diagnostics to include the dryerLint diagnositics.
    // This should occur after subscribing onDidChangeActiveTextEditor, in case an editor becomes active after subscribing, but before executing these lines of code.
    if (vscode.window.activeTextEditor) {
        tryRefreshDiagnostics(vscode.window.activeTextEditor.document, diagnosticsCollections, "initial activation");
    }
}

class DocumentStatus {
    // A data type for storing the status of a document, including the version number and the rule sets that are applied to it.
    version: number;
    ruleSets: RuleSet[] = []
    uri: string
    
    constructor(document: vscode.TextDocument) {
        this.uri = document.uri.toString()
        this.version = document.version;
        this.ruleSets = RuleSet.getMatchingRuleSets(document);
    }
}

class DocumentStatusCache {
    // A cache for storing the status of documents. The key is the document's URI and the value is a DocumentStatus object.
    // This is used to avoid reloading the rule sets for a document if they have not changed.
    private cache: { [uri: string]: DocumentStatus } = {};

    isFresh(document: vscode.TextDocument): boolean {
        return !this.isStale(document);
    }

    isStale(document: vscode.TextDocument): boolean {
        const uri: string = document.uri.toString();
        const cachedStatus: DocumentStatus | undefined = this.cache[uri];
        if (cachedStatus === undefined) {
            return true;
        } else if (cachedStatus.version !== document.version) {
            return true
        } else {
            return false;
        }
    }

    getRuleSets(document: vscode.TextDocument): RuleSet[] {
        // If the document is not in the cache, or if it is stale (the version number doesn't match the version in the cache), then put the document in the cache. 
        // The return value is true if a cache entry was created or updated and false otherwise.
        
        const uri: string = document.uri.toString();
        const cachedStatus: DocumentStatus | undefined = this.cache[uri];
        if (cachedStatus === undefined) {
            this.cache[uri] = new DocumentStatus(document)
        } else if (cachedStatus.version !== document.version) {
            this.cache[uri].version = document.version;
        }
        return this.cache[uri].ruleSets;
    }

    invalidate() {
        this.cache = {}
    }
}

const documentStatusCache = new DocumentStatusCache();

export function invalidateDocumentStatusCache() {
    documentStatusCache.invalidate();
}

function tryRefreshDiagnostics(document: vscode.TextDocument, diagnosticsCollections: vscode.DiagnosticCollection, reason: string): void {
    const fileName = document.fileName;
    const docName = path.basename(fileName);
    if (fileName.startsWith('extension-output-') || fileName.startsWith(DryerLintLogName)) {
        // Surprisingly, onDidChangeTextDocument is triggered with the extension output panel changes. 
        // This creates an infinite loop if we print anything to the consoue during refreshDiagnostics (spoiler: we do). 
        // This if/return block stops this from happening.
        return;
    }

    if (documentStatusCache.isFresh(document)) {
        // If the document version has not changed, then don't update diagnostics.
        dryerLintLog(`Skipped refreshing diagnostics for "${docName}" because the document version has not changed.`);
        return;
    }

    try{
        dryerLintLog(`Refresing diagnostics for "${docName}" due to "${reason}".`);
        refreshDiagnostics(document, diagnosticsCollections);
    } catch (error) {
        dryerLint.error(`There was an error while refreshing diagnostics: ${error}, ${Error().stack}`);
        vscode.window.showErrorMessage(`There was an error while refreshing diagnostics: "${error}".`);
        throw error;
    }
}

export function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
    dryerLintLog(`refreshDiagnostics()`);
    // If the current document is not in the workspace, then don't update diagnostics.
    // ?? Are we not able apply linting to non-workspace documents? 
    if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
        return;
    }

    const start_time = Date.now();

    const ruleSets: RuleSet[] = documentStatusCache.getRuleSets(document);
    dryerLintLog(`Time until getting matching rule sets: ${Date.now() - start_time}`)

    if (ruleSets?.length > 0) {
        dryerLintLog(`Refreshing diagnostics. Found ${ruleSets.length} rule sets for\n\t"${document.fileName}": [\n\t${ruleSets.join('\n\t')}\n]`);
    } else {
        dryerLintLog(`No Dryer Lint rule sets found for "${document.fileName}", which has language=${document.languageId}. No diagnostics will be generated.`);
        diagnostics.set(document.uri, []);
        return;
    }

    // Combine all of the rules from the rule sets into a single list.
    // const rules: Rule[] = ruleSets.flatMap(ruleSet => ruleSet.rules);
    const n_rules = ruleSets.reduce((count, ruleSet) => count + ruleSet.rules.length, 0);
    if (n_rules === 0) {
        dryerLintLog(`No Dryer Lint rules found in the rule sets [${ruleSets}]. No diagnostics will be generated.`);
        diagnostics.set(document.uri, []);
        return;
    }
    dryerLintLog(`Time until getting reduced rule sets: ${Date.now() - start_time}`)


    var commentChar = util.getLineCommentChar(document);
    if (!commentChar) {
        commentChar = "(?://|#)";
    }
    // Escape the comment character if it is ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\", or "/".
    const escapedCommentChar = commentChar.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    const dryerLintCommentConfigRegex = new RegExp('^[ \\t]*'+ escapedCommentChar + '[ \t]*dryer-lint:[ \\t]*(?<config>.*?)[ \\t]*(?:"(?<ruleSetId>[^"]+)")?[ \\t]*$', 'mi');

    const numLines = document.lineCount;
    
    const dryerLintEnabledLines: boolean[] = Array(numLines).fill(true);
    var ruleSetsEnabledLines: { [key: string]: boolean[] } = {};
    ruleSets.forEach(
        (ruleSet) => {
            ruleSetsEnabledLines[ruleSet.name] = Array(numLines).fill(true);
        }
    );

    for(var line=0; line < numLines; line++) {

        // Get the "range" of the current line.
        let thisLineRange = document.lineAt(line).range;
        const thisLine = document.getText(thisLineRange);

        // Set the current line enabled/disabled value equal to the previous line (except for the first line). We revise this value later if we find a Dryer Lint comment.
        if (line > 0) {
            dryerLintEnabledLines[line] = dryerLintEnabledLines[line-1];
            for (let ruleSetId in ruleSetsEnabledLines) {
                ruleSetsEnabledLines[ruleSetId][line] = ruleSetsEnabledLines[ruleSetId][line-1];
            }
        }

        // Match lines that look like this:
        //   dryer-lint: disable
        //   dryer-lint: enable
        //   dryer-lint: disabled
        //   dryer-lint: enabled
        //   dryer-lint: disabled = true
        //   dryer-lint: enabled = true
        //   dryer-lint: enable "latex rules"

        // Check if the text is enabling or disabling dryerLint.
        var commentConfigMatch = thisLine.match(dryerLintCommentConfigRegex);
        if (commentConfigMatch?.groups) {
            // If the config text is "disable", "disabled", or "enabled=false" (with optional spaces around the equal sign), then disable dryerLint.
            var enable: boolean | undefined = undefined;
            if (commentConfigMatch.groups.config.match(/(?:disable[d]?|enable[d]?[ \t]*=[ \t]*false)/)){
                enable = false;
            } else if (commentConfigMatch.groups.config.match(/enable[d]?(?:[ \t]*=[ \t]*true)?/)) {
                // If the config text is "enable", "enabled", or "enabled=true" (with optional spaces around the equal sign), then reenable dryerLint.
                enable = true;
            } else {
                vscode.window.showErrorMessage(`Dryer Lint: Invalid Config Comment in \"${document.fileName}\" at line=${line}: "${commentConfigMatch.groups.config}"`);
                continue;
            }

            const ruleSetId: string | undefined = commentConfigMatch.groups.ruleSetId;
            if (ruleSetId === undefined) {
                dryerLintEnabledLines[line] = enable;
                dryerLintLog(`Set dryerLintEnabledLines[line=${line+1}]=${enable} in \"${document.fileName}\" because of comment config "${commentConfigMatch.groups.config}".`);

            } else if (ruleSetsEnabledLines[ruleSetId] !== undefined) {
                ruleSetsEnabledLines[ruleSetId][line] = enable;
                dryerLintLog(`Set ruleSetsEnabledLines[${ruleSetId}][line=${line+1}]=${enable} in \"${document.fileName}\" because of comment config "${commentConfigMatch.groups.config}".`);
            } else {
                vscode.window.setStatusBarMessage(`Invalid RuleSetId "${ruleSetId}" in \"${path.basename(document.fileName)}\" at line=${line}.`, 15 * 1000);
                
                dryerLintLog(`Dryer Lint: Invalid RuleSetId in Config Comment in \"${document.fileName}\" at line=${line}: "${ruleSetId}" was not found amoung the rule sets [\"${ruleSets.map(ruleSet => ruleSet.name).join("\", \"")}\"].`);
                continue;
            }
        }
    }
    dryerLintLog(`Time until checking which rule sets are enabled at each line: ${Date.now() - start_time}`)

    const diagnosticList: RegexMatchDiagnostic[] = [];

    for (const ruleSet of ruleSets) {
        for (const rule of ruleSet.rules) { // Iterate over all of the rules
            // dryerLintLog(`Checking rule "${rule.name}."`)
            const rule_start_time = Date.now();

            for(var line=0; line < numLines; line++) {
                // If Dryer Lint or this particular RuleSet is disabled for this line, then skip it.
                if(!ruleSetsEnabledLines[ruleSet.name][line] || !dryerLintEnabledLines[line]) {
                    continue; // Skip line.
                }
                // Construct a text range that includes the current line and the lines afterward up to a total of "maxLines" (or the end of the file).
                // TODO: multiline rule violations can extend into disabled lines. We should filter out these lines, somehow. 
                const endLine = Math.min(line + rule.maxLines, numLines);
                let textRange = document.lineAt(line)
                                        .range
                                        .union(document
                                                .lineAt(endLine - 1) 
                                                .rangeIncludingLineBreak
                                        );

                const text = document.getText(textRange);

                // TODO: We should define an iterator for each rule set that takes the document and returns a list of ranges and the corresponding text.
                let array: RegExpExecArray | null;
                while (array = rule.regex.exec(text)) {// Search for matches until we find no more.
                    const range = rangeFromMatch(document, textRange, array);
                    if (range.start.line > line) {
                        // If the match starts on the next line, then don't create a diagnostic -- leave it for when the next line is processed
                        dryerLintLog(`Skipped the match "${array[0]}" for ${rule} because it starts after the current line (${range.start.line}>${line})`);
                        // Using "break" here causes us to miss matches. Maybe because the results of rule.regex.exec are not sorted?
                        continue;
                    } else {
                        dryerLintLog(`Matched ${rule} with "${array[0]}" (index=${array.index}) starting on line=${range.start.line}`);
                    }
                    const regexDiagnostic = new RegexMatchDiagnostic(rule, array, document, range);
                    diagnosticList.push(regexDiagnostic);
                }
            }
            
            dryerLintLog(`Checking rule took ${Date.now() - rule_start_time} ms: "${rule.name}"`);
        }// End of for-loop over "rules"
    }
    dryerLintLog(`Time until checking all rule sets finished: ${Date.now() - start_time}`)

    // Display the time required to check in the log and status bar. 
    const run_time = Date.now() - start_time;
    dryerLintLog(`Finished refreshing Dryer Lint diagnostics in ${run_time} ms for ${n_rules} rules from ${ruleSets.length} RuleSets applied to ${document.lineCount} lines in\n${document.fileName}.`);
    vscode.window.setStatusBarMessage(`Dryer Lint refresh: ${run_time} ms`, 2*1000);

    diagnostics.set(document.uri, diagnosticList);
    dryerLintLog(`Time to refresh diagnostics finished: ${Date.now() - start_time}`)
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
