import * as vscode from 'vscode';

// Define the name of the configurations used in the user's settings.json.
export const ConfigSectionName = 'relint-2';

enum FixTypes
{
    reorder_asc,
    reorder_desc,
    replace
}

export type FixType = keyof typeof FixTypes;

export type Severity = keyof typeof vscode.DiagnosticSeverity;

type Config = {
    fix?: string,
    fixType?: FixType,
    language?: string | string[],
    maxLines?: number,
    message: string,
    name: string,
    pattern: string,
    flags: string, // A string consisting of 'g' (global), 'm' (multiline), 'i' (case insensitive), 'y' (sticky search), and 'u' (unicode support)
    severity?: Severity
};

class Default
{
    static Fix = '$&';
    static FixType: FixType = 'replace';
    static Language = 'plaintext';
    static MaxLines = 1;
    static Flags = ''; // TODO: Maybe change defaults.
    static Severity: Severity = 'Warning';
}

export default class Rule
{
    // Create a global list of all rules.
    private static rules: Partial<Record<string, Rule[]>> = {};

    private constructor(
            readonly id: string,
            readonly fixType: FixType,
            readonly language: string,
            readonly maxLines: number,
            readonly message: string,
            readonly name: string,
            readonly regex: RegExp,
            readonly severityCode: vscode.DiagnosticSeverity,
            readonly fix?: string) { }

    public static get all(): Partial<Record<string, Rule[]>> {
        return this.rules;
    }

    public static loadAll() {
        this.rules = this.getRules();
        this.monitorRules();
    }

    static monitorRules() {
        // Whever the relint configurations change, update the list of rules.
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ConfigSectionName)) {
                this.rules = this.getRules();
            }
        });
    }

    static getRules(): Partial<Record<string, Rule[]>> {
        const relint_configuration = vscode.workspace.getConfiguration(ConfigSectionName);
        const globalLanguage = relint_configuration.get<string | string[]>('language') || Default.Language;
        const ruleList = relint_configuration.get<Config[]>('rules') ?? [];

        // TODO: Split this into multiple steps.
        return ruleList
            .filter(({
                fix,
                fixType,
                language,
                maxLines,
                message,
                name,
                pattern,
                flags,
                severity }) => {
                    // Filter any rules that are not properly defined.
                    return (
                        // if 'fixType' given, check that it is found in the FixTypes enumeration.
                        (fixType === undefined || FixTypes[fixType] !== undefined) &&
                        // If maxLines defined, check that it is positive
                        (maxLines === undefined || maxLines >= 0) && // !! Should be > 0?

                        // Require that a message is defined.
                        (!!message) &&
                        // If language is given, check that ...(?)
                        (language === undefined || !!language) &&
                        // Require that name is define.
                        (!!name) &&
                        // Require that pattern is defined.
                        (!!pattern) &&
                        // (flags == undefined || ) // TODO
                        // If the severity is defined, check that it is found in vscode.DiagnosticSeverity.
                        (severity === undefined || vscode.DiagnosticSeverity[severity] !== undefined) &&
                        // If the fix is defined, require that is not null.
                        (fix === undefined || fix !== null)
                    );
                })
            .map( // Set default values for the fixType and language.
                ({
                    fixType,
                    language = globalLanguage,
                    flags,
                    ...info
                }) => ({
                    ...info,
                    fixType: fixType || Default.FixType,
                    language: language || Default.Language,
                    flags: flags || Default.Flags
                })
            )
            // Handle the case where languages are given as a list. The result is to generate a distinct item for each language in the list.
            .flatMap(({ language, ...info }) => {
                if (!Array.isArray(language)) {// If a single language...
                    return [{ ...info, language }];
                }
                
                // Otherwise, language is an array...
                return language.map(lang => ({
                    ...info,
                    language: lang || Default.Language
                }));
            })
            .reduce( // 
                (rules, {
                    fix,
                    fixType,
                    language,
                    maxLines,
                    pattern,
                    flags,
                    severity,
                    ...info }) => {return ({
                    ...rules, [language]: [
                        ...(rules[language] ?? []), {
                            ...info,
                            id: `/${pattern}/`,
                            fixType,
                            fix: fixType === 'replace'
                                        ? fix
                                        : fix || Default.Fix,
                            language,
                            maxLines: fixType === 'replace'
                                        ? (maxLines ?? Default.MaxLines)
                                        : (maxLines ?? 0),
                            regex: new RegExp(pattern, `gm${flags}`),
                            severityCode: vscode.DiagnosticSeverity[severity!] ??
                                    vscode.DiagnosticSeverity[Default.Severity]
                        }
                    ]
                })}, <Partial<Record<string, Rule[]>>>{}
            );
    }
}
