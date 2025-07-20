import * as vscode from 'vscode';
import { logTrace, logDebug, logInfo, logWarn, logErrorMsg, logErrorObj } from './extension';
import path = require('path');
import { minimatch } from 'minimatch'
import isGlob = require("is-glob");
import { invalidateDocumentStatusCache, RegexMatchDiagnostic } from './diagnostics';
import {regex as regexPlus, pattern as patternPlus} from 'regex';

// Define the name of the configurations used in the user's settings.json.
export const ConfigSectionName: string = 'dryer-lint';
export const RuleSetsConfigName: string = 'dryerLint.ruleSets';

export type Severity = keyof typeof vscode.DiagnosticSeverity;
export enum RegexEngine {
    LEGACY = "legacy", 
    REGEX_PLUS = "regex+"
}

export type RuleSetConfig = {
    name: string, 
    language: string[] | string, 
    glob: string, 
    rules: RuleConfig[] | { [id: string] : RuleConfig; }
}

export type RuleConfig = {
    name: string,
    // The "pattern" option can be given as a single string or as an array of strings, allowing the pattern to be split between multiple lines. The entries of the array are concatenated together to form the final pattern.
    pattern: string | string[],
    fix?: string,
    maxLines?: number,
    message: string,
    regexEngine: RegexEngine,
    caseInsensitive: boolean,
    ignoreWhitespace: boolean;
    severity?: Severity;
};

// Add a utility function to normalize the pattern.
function normalizePatternConfig(pattern: string | string[]): string {
    if (Array.isArray(pattern)) {
        return pattern.join(''); // Join the array into a single string.
    }
    return pattern;
}

class RuleConfigDefault
{
    // static Fix = '$&';
    static Language = 'plaintext';
    static MaxLines = 1;
    static RegexEngine = RegexEngine.REGEX_PLUS;
    static CaseInsensitive = false;
    static IgnoreWhitespace: boolean = false;
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
        // The "languages" option may be given as a single language or as multiple strings in an array. 
        // We convert it to an array if it is a single string so that we can handle it in a single way.
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
                logWarn(`${this._name} had a bad glob pattern: ${glob}`);
                vscode.window.showErrorMessage(`${this._name} had a bad glob pattern: ${glob}`);
            }
        } else {
            logInfo(`No glob found for ${this}.`);
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

        // Check if the path to the file (relative to the root of the workspace) mathces the glob pattern.
        const doesMatchGlob = minimatch(relativePathFromWorkspaceRoot, this.glob, {dot: true});
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
                logDebug(`A diagnostic is active at the selected text: ${diagnostic}`);
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
        logInfo(`getMatchingRuleSets() Found ${filteredRuleSets.length} ruleSets matching "${path.basename(document.fileName)}".`);
        return filteredRuleSets;
    }

    toString() {
        // Create a string representation. 
        return `RuleSet{"${this._name}", languages: "${this.languages}", glob: "${this.glob}" rule count: ${this.rules.length}}`;
    }

    static loadRules(): void {
        try{
            RuleSet.all = RuleSet.getRules();
        } catch (e) {
            logErrorObj(`loadRules() failed.`, e)
        }
    }
    
    static getRules(): RuleSet[] {
        logInfo(`Reading list of RulesSets from settings.`);
        const dryerLintConfig: vscode.WorkspaceConfiguration  = vscode.workspace.getConfiguration("dryerLint");
        
        if (!dryerLintConfig.has("ruleSets")){
            throw new Error(`No "dryerLint.ruleSets" setting was not found!`);
        }
        
        // Handle the rule set being given as either an array or dictionary. 
        // We are moving away from arrays and prefer dictionaries, but we continue to support
        // arrays for backward compatibility.
        const ruleSetsConfigArrayOrDict = dryerLintConfig.get("ruleSets");
        var ruleSetsConfigsArray: RuleSetConfig[] = [];
        if (Array.isArray(ruleSetsConfigArrayOrDict)) {// If list of rule sets is given as an array...
            ruleSetsConfigsArray = dryerLintConfig.get<RuleSetConfig[]>("ruleSets") || [];
        } else {// If configuration is a dictionary...
            const ruleSetsConfigsDict: { [id: string] : RuleSetConfig; } = dryerLintConfig.get<{ [id: string] : RuleSetConfig; }>("ruleSets") || {};
            // Map the dictionary to an array, storing the name in the "name" property.
            ruleSetsConfigsArray = Object.keys(ruleSetsConfigsDict).flatMap(
                (name: string) => {
                    // Set the name to the key given for the rule set.
                    ruleSetsConfigsDict[name].name = name;
                    return ruleSetsConfigsDict[name];
                }
            )
        }
        
        // if (ruleSetsConfigs.length == 0){
        //     throw new Error("The setting dryerLint.ruleSets was empty!");
        // }

        // !! Print statements for debugging.
        // dryerLintLog(`ruleSetsConfigs:`)
        // ruleSetsConfigs.forEach(
        //     (ruleSetConfig) => {
        //         dryerLintLog(`\tname: "${ruleSetConfig.name}", language: "${ruleSetConfig.language}", rule count: ${ruleSetConfig.rules.length}`);
        //     }
        // )

        const ruleSets: RuleSet[] =  ruleSetsConfigsArray.flatMap(
            (ruleSetConfig: RuleSetConfig) => {
                var rules: Rule[];
                if (Array.isArray(ruleSetConfig.rules)) {
                    // Generate the array of rules from the array of RuleConfigs.
                    rules = ruleSetConfig.rules.flatMap(rule => {
                        return Rule.ruleConfigToRule(rule) || [];
                    });
                } else {
                    // Cast to a dictionary.
                    const ruleConfigsDict: {[name: string]: RuleConfig;} = ruleSetConfig.rules;
                    
                    // Generate an array of Rules from the dictionary of RuleConfigs.
                    rules = Object.keys(ruleConfigsDict).flatMap(
                        (name: string) => {
                            rules
                            const ruleConfig = ruleConfigsDict[name];
                            // Set "name" property.
                            ruleConfig.name = name;
                            // Convert the RuleConfig to a Rule (or an empty element, if an error occurs)
                            return Rule.ruleConfigToRule(ruleConfig) || [];
                        }
                    )
                }
                const glob: string = ruleSetConfig.glob || "**";
                const ruleSet: RuleSet = new RuleSet(ruleSetConfig.name, ruleSetConfig.language, glob, rules);
                logDebug(`\t${ruleSet}`);
                return ruleSet;
            }
        );
        logInfo(`\tLoaded ${ruleSets.length} RuleSets.`);
        return ruleSets;
        // var n_invalid_rules = ruleList.length - valid_rules.length
        // if (n_invalid_rules == 0) {
        //     vscode.window.setStatusBarMessage(`Dryer Lint: ${ruleList.length} rules OK.`, 30*1000);
        // } else {
        //     vscode.window.setStatusBarMessage(`Dryer Lint: ${n_invalid_rules} invalid rule(s).`, 30*1000);
        // }

    }

    static loadLegacyRuleSet() {
        logInfo(`Reading list of legacy rules from settings.`);
        try {
            const dryer_lint_config = vscode.workspace.getConfiguration(ConfigSectionName);
            const language = dryer_lint_config.get<string | string[]>('language') || [];
            const ruleConfigs: RuleConfig[] = dryer_lint_config.get<RuleConfig[]>('rules') ?? [];

            const rules = ruleConfigs.flatMap(rule => Rule.ruleConfigToRule(rule) || []);
            const glob = "**";
            RuleSet.legacyRuleSet = new RuleSet('legacy rules', language, glob, rules);

            logInfo(`Found ${rules.length} rules in the legacy rules.`)
        } catch (error) {
            logErrorObj(`Reading the legacy rules failed.`, error)
            vscode.window.showErrorMessage(`Reading the legacy rules failed. Error: "${error}".`)
        }
        
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
            if (event.affectsConfiguration(RuleSetsConfigName)) {
                logInfo(`The list of rule sets "${RuleSetsConfigName}" changed in the settings.`);
                RuleSet.loadRules();
                invalidateDocumentStatusCache();
            } 
            // 
            if (event.affectsConfiguration(ConfigSectionName)) {
                // While we work on deprecating this, we load the legacy rules.
                logInfo(`The list of legacy rules "${ConfigSectionName}" changed in the settings.`);
                RuleSet.loadLegacyRuleSet();
                invalidateDocumentStatusCache();
            } else {
                // Change to settings does not affect DryerLint.
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

        var name = ruleConfig.name;
        // Set the message to "name" if "message" is empty.
        var message = ruleConfig.message || ruleConfig.name;
        var maxLines = ruleConfig.maxLines || RuleConfigDefault.MaxLines;
        var pattern: string = normalizePatternConfig(ruleConfig.pattern);
        var regexEngine: RegexEngine = ruleConfig.regexEngine || RuleConfigDefault.RegexEngine;
        var caseInsensitive = ruleConfig.caseInsensitive || RuleConfigDefault.CaseInsensitive;
        var ignoreWhitespace = ruleConfig.ignoreWhitespace || RuleConfigDefault.IgnoreWhitespace;
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

        // Set the RegEx flags.
        // * g: Find all of the matches.
        // * i: (Optional) Case insensitive.
        var flags = caseInsensitive? `gmi` : `gm`;
        var regex: RegExp | undefined;
        try {
            switch (regexEngine) {
                case RegexEngine.LEGACY:
                        regex = new RegExp(pattern, flags);
                    break;
                case RegexEngine.REGEX_PLUS:
                    regex = regexPlus({
                        flags: flags,
                        // Enabling "subclass" and disabling the "n" flag allows users to reference groups by the group number in messages and fixes.
                        subclass: true,
                        disable: {
                            // The "x" flag causes whitespace to be ignored. The negation here is confusing, but it is correct.
                            // When ignoreWhitespace is true, we want to not disable the "x" flag, so that whitespace is ignored.
                            // Alternatively, when ignoreWhitespace is false, we disable the "x" flag, so that whitespace is not ignored (restoring the default JS Regular Expression behavior).
                            x: !ignoreWhitespace, 
                            // Disable the "named capture only" mode, which turns unnamed groups (…) into noncapturing groups. 
                            // With this disabled, we can reference groups by numbers in replacement strings (e.g., "$1"), but we need to set "subclass: true" to prevent the 
                            n: true,
                        }
                    })({raw: [pattern]});
                    break;
                default:
                    throw new Error(`Unexpected case: ${regexEngine}.`)
            }
            logTrace(`Regex for "${ruleConfig.name}" is "${regex}".`);
        } catch (error) {
            const errorMsg: string = `Could not construct Regex for "${ruleConfig.name}"\nError: "${error}".\nPattern: ${pattern}.`;
            logWarn(errorMsg);
            vscode.window.showErrorMessage(errorMsg);
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