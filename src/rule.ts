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

        const valid_rules = ruleList.filter(
            ({fix, fixType, language, maxLines, message, name, pattern, flags, severity }) => {
                            
                
            // if 'fixType' given, check that it is found in the FixTypes enumeration.
            if (fixType !== undefined && FixTypes[fixType] === undefined) {
                vscode.window.showErrorMessage(`Invalid fix type "${fixType}" for the relint rule "${name}".`)
                return false
            }

            // If maxLines defined, check that it is positive
            if (maxLines !== undefined && !(maxLines >= 0)) {// !! Should maxLines be > 0?
                vscode.window.showErrorMessage(`Invalid maxLines="${maxLines}" for the relint rule "${name}".`)
                return false
            }

            if (!message){
                vscode.window.showErrorMessage(`Missing message for the relint rule "${name}".`)
                return false
            }

            if (language !== undefined && !language){
                vscode.window.showErrorMessage(`Invalid language for the relint rule "${name}".`)
                return false
            }

            if (!name){
                vscode.window.showErrorMessage(`Missing name for the relint rule with pattern="${pattern}".`)
                return false
            }

            if (!pattern){
                vscode.window.showErrorMessage(`Invalid pattern "${pattern}".`)
                return false
            }

            if (flags && !isValidRegexFlags(flags)) {
                vscode.window.showErrorMessage(`Invalid regex flags "${flags}" for the relint rule "${name}" Note that "g" and "m" are included by default.`)
                return false
            }

            if (severity !== undefined && vscode.DiagnosticSeverity[severity] === undefined) {
                vscode.window.showErrorMessage(`Invalid severity "${severity}" for the relint rule "${name}".`)
                return false
            }

            if (severity !== undefined && vscode.DiagnosticSeverity[severity] === undefined) {
                vscode.window.showErrorMessage(`Invalid severity "${severity}" for the relint rule "${name}".`)
                return false
            }

            if (fix !== undefined && fix === null) {
                vscode.window.showErrorMessage(`Invalid fix "${fix}" for the relint rule "${name}".`)
                return false
            }

            return true
        });
        
        var n_invalid_rules = ruleList.length - valid_rules.length
        if (n_invalid_rules == 0) {
            vscode.window.setStatusBarMessage(`Relint: ${ruleList.length} rules OK.`, 30*1000);
        } else {
            vscode.window.setStatusBarMessage(`Relint: ${n_invalid_rules} invalid rule(s).`, 30*1000);
        }

        return valid_rules.map( // Set default values for the fixType and language.
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
                (rules, {fix, fixType, language, maxLines, pattern, flags, severity, ...info }) => {
                    var regex: RegExp;
                    try {
                        regex = new RegExp(pattern, `gm${flags}`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Could not construct Regex. Error: "${error}".`)
                        return rules
                    }
                    return ({
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
                                regex: regex,
                                severityCode: vscode.DiagnosticSeverity[severity!] ??
                                    vscode.DiagnosticSeverity[Default.Severity]
                            }
                        ]
                    });
                }, <Partial<Record<string, Rule[]>>>{}
            );
    }
}

function isValidRegexFlags(flags: string): boolean {
    // We omitt "g" and "m" because they are always included when we construct our regular expressions. 
    const validFlags = new Set(["i", "s", "u", "y"]);

    // Ensure the string only contains valid characters and has no duplicates
    return [...flags].every((char, i, arr) => validFlags.has(char) && arr.indexOf(char) === i);
}