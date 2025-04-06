import * as vscode from 'vscode';
import { dryerLintLog } from './extension';
import { escape, glob, globIterateSync, globSync, Path } from 'glob';
import { cwd } from 'process';
import path = require('path');
import isGlob = require("is-glob");
import { invalidateLastDocumentsRefreshVersions, RegexMatchDiagnostic } from './diagnostics';

// Define the name of the configurations used in the user's settings.json.
export const ConfigSectionName: string = 'dryer-lint';
export const RuleSetsConfigName: string = 'dryerLint.ruleSets';

export type Severity = keyof typeof vscode.DiagnosticSeverity;

export type RuleSetConfig = {
    name: string, 
    language: string[] | string, 
    glob: string, 
    rules: RuleConfig[]
}

export type RuleConfig = {
    name: string,
    pattern: string,
    fix?: string,
    maxLines?: number,
    message: string,
    caseInsensitive: boolean,
    severity?: Severity
};

class RuleConfigDefault
{
    // static Fix = '$&';
    static Language = 'plaintext';
    static MaxLines = 1;
    static CaseInsensitive = false;
    static Severity: Severity = 'Warning';
}

export class RuleSet {
    // Global list of rule sets.
    private static all: RuleSet[] = [];
    private static legacyRuleSet: RuleSet;

    private _name: string;
    private languages: string[];
    private glob: string;
    public rules: Rule[];

    constructor (name: string, languages: string | string[], glob: string, rules: Rule[]) {
        this._name = name;
        // "languages" may be given as a single language or as multiple, so we convert it to an array if it is a single string.
        if (typeof languages === 'string') {
            this.languages = [languages];
        } else {
            this.languages = languages;
        }
        this.glob = glob;
        this.rules = rules;

        // Check that the glob are OK.
        if (this.glob){
            if(!isGlob(glob)) {
                vscode.window.showErrorMessage(`${this._name} had a bad glob pattern: ${glob}`);
            }
        } else {
            dryerLintLog(`No glob found for ${this}.`);
        }
    }

    public get name(): string {
        return this._name;
    }

    public doesMatchDocument(document: vscode.TextDocument): boolean {
        return this.doesMatchLanguage(document.languageId) && this.doesMatchGlob(document.fileName);
    }

    private doesMatchLanguage(languageId: string): boolean {
        return this.languages.includes(languageId);
    }

    private doesMatchGlob(filePath: string): boolean {

        // TODO: We don't handle multiroot workspaces: https://code.visualstudio.com/docs/editor/workspaces/workspaces#_multiroot-workspace
        const workspaceFolder: string  | undefined = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (workspaceFolder === undefined) {
            return false;
        }
        const relativePathFromWorkspaceRoot = path.relative(workspaceFolder, filePath);

//         dryerLintLog("Current working directory:" + cwd())
//         dryerLintLog("glob working directory: " + workspaceFolder)
//         dryerLintLog("glob pattern: " + this.glob)
//         dryerLintLog("glob relativePathFromWorkspaceRoot: " + relativePathFromWorkspaceRoot)
        // const globs = [this.glob, escape(relativePathFromWorkspaceRoot)];
        // dryerLintLog(`glob array: [${globs}]`)
        
        // const ignoreAllButTargetFilePattern = `!(**/${path.basename(relativePathFromWorkspaceRoot)})`;
        // dryerLintLog(`ignoreAllButTargetFilePattern: ${ignoreAllButTargetFilePattern}`)

        const globResult:string[] = globSync(
            this.glob,
            { 
                // Search relative to workspace root. 
                cwd: workspaceFolder, 
                // // Include .dot files in matches. Note that an explicit dot in a portion of the pattern will always match dot files. Without this option, files such as ".vscode/settings.json" would not be matched by "**/*.json" 
                dot: true,      
                // Only find files
                nodir: true, 
                //// Ignore everything except the file we are looking for.
                // ignore: "!*.tex"
                // ignore: [ignoreAllButTargetFilePattern, 
                //         // Also ignore .git directories and their contents. 
                //          "**/.git/**"]
                ignore: {

                    ignored: (p: Path) => {
                        // dryerLintLog(`p: ${p.name}, ${p.isNamed("plaintext_dryer_lint_test.txt")}`)
                        return !p.isNamed(path.basename(filePath));
                    },
                    childrenIgnored: (p: Path) => {
                        return p.isNamed('.git') || p.isNamed('node_modules'); 
                    }
                },
             }
        );
        const doesMatchGlob: boolean = globResult.includes(relativePathFromWorkspaceRoot);

        if (globResult?.length > 0) {
            dryerLintLog(`Results for glob="${this.glob}" in "${workspaceFolder}" for ${this}: [\n\t${globResult.join('\n\t')}\n]`);
        } else {
            dryerLintLog(`Found no files for glob="${this.glob}" in "${workspaceFolder}" for ${this}.`);
        }
        // dryerLintLog(`Is ${relativePathFromWorkspaceRoot} in globReults? ${doesMatchGlob}`)
        return doesMatchGlob;
    }

    // Get a vscode.DocumentSelector, as described here: https://code.visualstudio.com/api/references/document-selector
    // Currently, we only filter based on document language---not by glob. 
    // Including the glob causes documents not to match the filter, but I don't know why. This is OK since we use this to determine which files to run fix providers for this RuleSet, but fix providers only generate fixes for diagnostics in the file, so if a document doesn't match this RuleSet (per ruleSet.doesMatchDocument()), then no diagnostics or fixes will be provided.
    public getDocumentLanguageFilter(): vscode.DocumentFilter[] {
        return this.languages.flatMap(
            (language) => {
                // !! 
                // return {language: language, pattern: this.glob}
                return {language: language};
            }
        );
    }

    public getFixableDiagnostics(selection_range: vscode.Range, diagnostics: vscode.Diagnostic[]): RegexMatchDiagnostic[] {
        const allFixableMatchingRules: Rule[] = this.rules.filter(rule => rule.fix !== undefined);
        const fixableDiagnostics: RegexMatchDiagnostic[] = <RegexMatchDiagnostic[]> diagnostics.filter(
            (diagnostic) => {
                return diagnostic instanceof RegexMatchDiagnostic
                        && allFixableMatchingRules.includes(diagnostic.rule) 
                        && diagnostic.range.intersection(selection_range);
            }
        );
        // var fixableRegexDiagnostics = this.ruleSet.getFixableDiagnostics(selection_range, context.diagnostics)

        // Print a message for debugging.
        fixableDiagnostics.forEach(
            (diagnostic) => {
                dryerLintLog(`A diagnostic is active at the selected text: ${diagnostic}`);
            }
        );
        return fixableDiagnostics;
    }
    
    getFixableRules(): Rule[] {
        return this.rules.filter(rule => rule.fix !== undefined);
    }

    static getAllRules() {
        return RuleSet.all.concat([RuleSet.legacyRuleSet]);
    }

    public static getMatchingRuleSets(document: vscode.TextDocument): RuleSet[] {
        // While we are working on deprecating the old method of specifying rules, we include it into the set of rules we apply
        const allRuleSetsIncludingLegacy = RuleSet.all.concat([RuleSet.legacyRuleSet]);

        const filteredRuleSets: RuleSet[] = allRuleSetsIncludingLegacy.filter(
            (ruleSet) => ruleSet.doesMatchDocument(document)
        );
        dryerLintLog(`getMatchingRuleSets() Found ${filteredRuleSets.length} ruleSets matching "${path.basename(document.fileName)}".`);
        return filteredRuleSets;
    }

    toString() {
        // Create a string representation. 
        return `RuleSet{"${this._name}", languages: "${this.languages}", glob: "${this.glob}" rule count: ${this.rules.length}}`;
    }

    static loadRules(): void {
        RuleSet.all = RuleSet.getRules();
    }
    
    static getRules(): RuleSet[] {
        dryerLintLog(`Reading list of RulesSets from settings.`);
        const dryerLintConfig: vscode.WorkspaceConfiguration  = vscode.workspace.getConfiguration("dryerLint");
        
        if (!dryerLintConfig.has("ruleSets")){
            throw new Error("The setting dryerLint.ruleSets was not found!");
        }
        const ruleSetsConfigs: RuleSetConfig[] = dryerLintConfig.get<RuleSetConfig[]>("ruleSets") || [];
        
        if (ruleSetsConfigs.length == 0){
            throw new Error("The setting dryerLint.ruleSets was empty!");
        }

        // !! Print statements for debugging.
        // dryerLintLog(`ruleSetsConfigs:`)
        // ruleSetsConfigs.forEach(
        //     (ruleSetConfig) => {
        //         dryerLintLog(`\tname: "${ruleSetConfig.name}", language: "${ruleSetConfig.language}", rule count: ${ruleSetConfig.rules.length}`);
        //     }
        // )

        const ruleSets: RuleSet[] =  ruleSetsConfigs.flatMap(
            (ruleSetConfig: RuleSetConfig) => {
                const rules: Rule[] = ruleSetConfig.rules.flatMap(rule => Rule.ruleConfigToRule(rule) || [] );
                const glob: string = ruleSetConfig.glob || "**";
                const ruleSet: RuleSet = new RuleSet(ruleSetConfig.name, ruleSetConfig.language, glob, rules);
                dryerLintLog(`\t${ruleSet}`);
                return ruleSet;
            }
        );
        dryerLintLog(`\tLoaded ${ruleSets.length} RuleSets.`);
        return ruleSets;
        // var n_invalid_rules = ruleList.length - valid_rules.length
        // if (n_invalid_rules == 0) {
        //     vscode.window.setStatusBarMessage(`Dryer Lint: ${ruleList.length} rules OK.`, 30*1000);
        // } else {
        //     vscode.window.setStatusBarMessage(`Dryer Lint: ${n_invalid_rules} invalid rule(s).`, 30*1000);
        // }

    }

    static loadLegacyRuleSet() {
        dryerLintLog(`Reading list of legacy rules from settings.`);
        const dryer_lint_config = vscode.workspace.getConfiguration(ConfigSectionName);
        const language = dryer_lint_config.get<string | string[]>('language') || [];
        const ruleConfigs: RuleConfig[] = dryer_lint_config.get<RuleConfig[]>('rules') ?? [];

        const rules = ruleConfigs.flatMap(rule => Rule.ruleConfigToRule(rule) || []);
        const glob = "**";
        RuleSet.legacyRuleSet = new RuleSet('legacy rules', language, glob, rules);
    }
}

export default class Rule
{
    // Create a global list of all rules.
    private static rules: Partial<Record<string, Rule[]>> = {};

    private constructor(
            readonly id: string, // Contains the regex pattern.
            readonly maxLines: number,
            readonly message: string,
            readonly name: string,
            readonly regex: RegExp,
            readonly severityCode: vscode.DiagnosticSeverity,
            readonly fix?: string) { }

    public toString(): string {
        return `Rule{"${this.name}", Max lines: ${this.maxLines}, Has fix? ${this.fix? "Yes.": "No."}}`;
        // return `Rule{"${this.name}", ${this.regex}, ${this.fix? "Has fix.": "Does not have fix"}}`
    }

    public static get all(): Partial<Record<string, Rule[]>> {
        return this.rules;
    }

    public static loadAll() {
        // Whenever the Dryer Lint configurations change, update the list of rules.
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigSectionName)) {
                // While we work on deprecating this, 
                RuleSet.loadLegacyRuleSet();
                invalidateLastDocumentsRefreshVersions();
            }
        });
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(RuleSetsConfigName)) {
                RuleSet.loadRules();
                invalidateLastDocumentsRefreshVersions();
            }
        });

        RuleSet.loadLegacyRuleSet();
        RuleSet.loadRules();
    }

    public static ruleConfigToRule(ruleConfig: RuleConfig): Rule | undefined {

        if (!ruleConfig.name){
            vscode.window.showErrorMessage(`Missing name for the Dryer Lint rule with pattern="${ruleConfig.pattern}".`);
            return undefined;
        }
        
        if (!ruleConfig.pattern){
            vscode.window.showErrorMessage(`Missing or invalid pattern "${ruleConfig.pattern} for "${ruleConfig.name}".`);
            return undefined;
        }


        // Set the message to "name" if "message" is empty.
        var name = ruleConfig.name;
        var message = ruleConfig.message || ruleConfig.name;
        var maxLines = ruleConfig.maxLines || RuleConfigDefault.MaxLines;
        var pattern = ruleConfig.pattern;
        var caseInsensitive = ruleConfig.caseInsensitive || RuleConfigDefault.CaseInsensitive;
        var severity = vscode.DiagnosticSeverity[ruleConfig.severity || RuleConfigDefault.Severity];
        var fix = ruleConfig.fix;

        // if (ruleConfig.severity !== undefined && vscode.DiagnosticSeverity[ruleConfig.severity] === undefined) {
        if (severity === undefined) {
            vscode.window.showErrorMessage(`Invalid severity "${ruleConfig.severity}" for the Dryer Lint rule "${ruleConfig.name}".`);
            return undefined;
        }

        // If maxLines defined, check that it is positive
        if (maxLines < 1) {
            vscode.window.showErrorMessage(`Invalid maxLines="${ruleConfig.maxLines}" for the Dryer Lint rule "${ruleConfig.name}". Must be greater than or equal to zero.`);
            return undefined;
        }

        if (typeof caseInsensitive !== "boolean") {
            vscode.window.showErrorMessage(`Value of caseInsensitive="${caseInsensitive}" should be "true" or "false" for the Dryer Lint rule "${ruleConfig.name}".`);
            return undefined;
        }

        if (ruleConfig.fix !== undefined && ruleConfig.fix === null) {
            vscode.window.showErrorMessage(`Invalid ruleConfig.fix "${ruleConfig.fix}" for the Dryer Lint rule "${ruleConfig.name}".`);
            return undefined;
        }

        var regex: RegExp | undefined;
        try {
            // Set the RegEx flags.
            // * g: Find all of the matches.
            // * i: (Optional) Case insensitive.
            var flags = caseInsensitive? `gmi` : `gm`;
            regex = new RegExp(pattern, flags);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not construct Regex for "${ruleConfig.name}"\nError: "${error}".`);
            return undefined;
        }

        return new Rule(
            `/${pattern}/`, // Contains the regex pattern.
            maxLines,
            message,
            name,
            regex,
            severity,
            fix
        );
    }
    
}