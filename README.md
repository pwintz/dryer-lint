# **Dryer Lint**: A Do-Regex-Yourself (DRY) Linter Extension for VS Code

![Dryer Lint Logo](https://github.com/pwintz/dryer-lint/blob/3439fc14c6f6bc0ad4c45be317344c5655aa5331/assets/dryer_lint_logo.png?raw=true)

Dryer Lint is a language- and framework-agnostic linter for VS Code. 
It is designed to
- allow syntax checking for programming languages that do not yet have their own specialized linters
- define user-specific lint rules for a given project or code style.
- Enable automated fixes to rule violations. 
 
Dryer Lint is based on the [`relint`](https://github.com/n0bra1n3r/relint) extension by Ryan Blonna (GitHub user [n0bra1n3r](https://github.com/n0bra1n3r)).

<!-- ## Short Demo

Here is a short demo showing two Dryer Lint rules for checking [Nim](https://nim-lang.org/) projects:

```jsonc
// .vscode/settings.json
{
    ...

    "dryer-lint": {
        "language": "nim",
        "rules": [
            {
                "name": "syntax-addr",
                "pattern": "(?<=\\W|^)(?:addr\\((.+)\\)|addr (.+)|addr: (.+)|(.+)\\.addr)",
                "message": "syntax: use command syntax for `addr`",
                "fix": "(addr)$1$2$3$4",
                "severity": "Warning"
            },
            {
                "name": "syntax-pragma",
                "pattern": "{\\.(.+),\\ *(.*)}",
                "message": "syntax: use spaces to separate pragmas",
                "fix": "{.$1 $2}",
                "severity": "Warning"
            }
        ]
    },

    ...
}
```

![Demo1](assets/relint-demo1.gif?raw=true) -->


## Features

Dryer Lint produces configurable diagnostics for _rule violations_, each of which are described by a [regular expression](https://www.regular-expressions.info/). 
Rules can also be assigned _fixes_ that define replacements for rule violations.
The behavior similar to VS Code's built-in regex [find-and-replace functionality](https://code.visualstudio.com/docs/editor/codebasics#_find-and-replace).


# Usage Guide

Dryer Lint rules are created by adding them to `.vscode/settings.json` within your workspace.  
Rules are grouped into one or more "rule sets". 
For each rule set, you can set one or more languages where the rule applies and a file glob (such as `**/settings.json`). 
Here is an example:
```jsonc
"dryerLint.ruleSets": [
    {
        "name": "Example Rule Set 1",
        // Set the name of the languages where your rules apply
        "language": "c++",
        // Set a file glob (optional)
        "glob": "**/filename.c",
        // Set a list of rules.
        "rules": [
            {
                // "name" is a string used to identify the rule
                "name": "No apples or oranges. Only bananas",
                // "pattern" is a JavaScript regular expression that shows diagnostic when matched
                "pattern": "(apple|orange)",
                // "message" is a string to show in the "Problems" VS Code panel or other places that diagnostics are shown.
                "message": "Don't use apples or oranges. Only bananas!",
                // "fix" (optional) is a string to replace the matched pattern.
                "fix": "banana",
                // "severity" (optional) is a string that must contain one of these values: "Hint", "Information", "Warning", or "Error". The default is "Warning".
                "severity": "Error",
                // "maxLines" (optional) is a positive integer that sets the max number of lines that the pattern is checked against at one time. The default is 1.
                "maxLines": 2, 
                // "caseInsensitive" (optional) is a boolean value that sets whether the regular expression uses the case insensitive flag "i". Default is false. 
                "caseInsensitive": true
            },
        ]
    }, 
    {
        "name": "Example Rule Set 2", 
        "language": ["javascript", "typescript"],
        "rules": [
            {
                "name": "Rule 1",
                // ...
            },
            {
                "name": "Rule 2",
                // ...
            }
        ]
    },
    // ...
]
```
<!-- 
```jsonc
"dryer-lint": {
    // Set the name of the languages where your rules apply
    "language": ["c++", "java"],
    "rules": [
        {
            // "name" is a string used to identify the rule
            "name": "No apples or oranges. Only bananas",
            // "pattern" is a JavaScript regular expression that shows diagnostic when matched
            "pattern": "(apple|orange)",
            // "message" is a string to show in the "Problems" VS Code panel or other places that diagnostics are shown.
            "message": "Don't use apples or oranges. Only bananas!",
            // "fix" (optional) is a string to replace the matched pattern.
            "fix": "banana",
            // "severity" (optional) is a string that must contain one of these values: "Hint", "Information", "Warning", or "Error". The default is "Warning".
            "severity": "Error",
            // "maxLines" (optional) is a positive integer that sets the max number of lines that the pattern is checked against at one time. The default is 1.
            "maxLines": 2, 
            // "caseInsensitive" (optional) is a boolean value that sets whether the regular expression uses the case insensitive flag "i". Default is false. 
            "caseInsensitive": true
        },
    ]
},
``` -->
The following animation shows errors diagnostics added by Dryer Lint, matching the above rule, and quick actions used to apply the replacement “fix”.
In the first step, an individual rule violation is selected and fixed. 
In the second step, multiple rule violations are selected in the text and a “Fix all” option is used to fix all of them in a single step.

![Dryer Lint Animation](https://github.com/pwintz/dryer-lint/blob/3439fc14c6f6bc0ad4c45be317344c5655aa5331/assets/dryer-lint-animation.gif?raw=true)

In this animation, the highlighting and inline display of error messages is achieved with [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) extension.
We highly recommend the use of Error Lens with Dryer Lint.

## Guide to Writing Regex 

To learn regex and test new rules, the website [https://regex101.com/](regex101.com) is invaluable.
Saving the regex in regex101.com and placing a link to the saved regex makes it easier to test changes to the expression in the future. 
```jsonc
{
    // Link: https://regex101.com/r/QsDziM/latest
    // Match any single letter "l" that is not part of a word or wrapped in "\textsc{...}".
    "name": "\"l\" instead of \"\\ell\"",
    "pattern": "(?<![a-zA-Z]|\\\\textsc\\{)l(?=[ _\\r\\n]|\\W)",
    "message": "Avoid \"l\" as a symbol. Use \"\\ell\" instead.",
    "severity": "Warning",
    "fix": "\\ell"
}
```
(See the section “Escaping Regular Expressions”, below, regarding copying expression from regex101.com into settings JSON file.)

### Regex Flags
In Dryer Lint, all regex searches use the `g` flag (to find multiple matches instead of only the first) and the `m` flag (so that `^` matches the start of each line and `$` matches the end of each line).
If `"caseInsensitive": true` for a given rule, then the `i` flag is also used.

### Matching Line Breaks
By default, each regex rule is applied to a single line at a time, in which case `^` matches the start of a line and `$` matches the end.
When `maxLines` is more than `1` (the default), however, each regex searches over the given number lines. 
Since the `m` flag is used, `^` matches the start of each line and `$` matches the end of each line.
<!-- In this case, `^` matches the start of the entire string and `$`, the end (The `m` regex flag is not used).  -->
<!-- To match a new line in the middle of the string, use `\r?\n` (which matches both the Windows line break `\r\n` and the Unix line break `\n`). -->

### Group Replacements in Fixes and Messages

In each rule definition, the `"fix"` and `"message"` fields can use replacements from the matched Regex groups.
The string `$0` is replaced by the entire match, `$1` is replaced with the contents of the first group capture, and `"$2"` is replaced with the second, and so on.
The following is an example of a rule for LaTeX, where the first group `(cref|eqref|ref|cite)` is substituted into the error message.
```jsonc
{
    // Check for \cref{}, \cite{}, \ref{}, or \eqref{} occurring without arguments.
    "name": "Empty Reference or Citation",
    "message": "Empty \\$1{}.",
    "pattern": "\\\\(cref|eqref|ref|cite)\\{\\s*\\}",
    "severity": "Error"
},
```
The resulting error message from 
```latex
\cite{}
```
is “Empty \cite{}."

## Escaping Regular Expressions 
In JSON, the backslash character `\` is used to escape other characters, so, for example, `\t` is a tab character, `\n` is a new line character, and (critically) `\\` is a backslash.
Backslashes are used extensively in regular expressions. 
To write regex in JSON, replace every occurrence of `\` with `\\`.  

## Disable/Enable via Inline Comment 

You can disable Dryer Lint for portions of a file using an inline comment such as (in C++):
```c++
// dryer-lint: disable
```
The following comments also disable Dryer Lint:
```c++
// dryer-lint: disabled
// dryer-lint: enable=false
// dryer-lint: enabled=false
```
To re-enable Dryer Lint, use any of the following:
```c++
// dryer-lint: enable
// dryer-lint: enabled
// dryer-lint: enable=true
// dryer-lint: enabled=true
```
The inline comment must be the only contents of the line except for empty space.

The inline comment characters for the following languages are recognized: 
```json
    c: "//",
    cpp: "//",
    java: "//",
    javascript: "//",
    latex: "%",
    python: "#",
    ruby: "#",
    shellscript: "#",
    typescript: "//",
```
If a language is not recognized, then lines starting with `//` or `#` are treated as comments for the purpose of toggling Dryer Lint on and off.


## More examples

The following is a more complex example that uses the **replace** function to organize imports at the top of a Nim file.

```jsonc
// .vscode/settings.json
{
    ...

    "dryerLint.ruleSets": [
        {
            "name": "nim imports",
            "language": "nim",
            "rules": [
                {
                    "fix": "$1\r\n$4",
                    "message": "organization: bad spacing in import group",
                    "maxLines": 0,
                    "name": "organization-import",
                    "pattern": "(^import ([.\\w]+)/.+)(\\r\\n){2,}(^import \\2/.+)"
                },
                {
                    "fix": "$1\r\n\r\n$4",
                    "message": "organization: bad spacing in import group",
                    "maxLines": 0,
                   "name": "organization-import",
                    "pattern": "(^import ([.\\w]+)/.+)(\\r\\n|(?:\\r\\n){3,})(^import (?!\\2/).+)"
                }
            ]
        }
    ]
    ...
}
```

<!-- ![Demo2](assets/relint-demo2.gif?raw=true) -->

This configuration ensures import groups are separated by 1 newline and ensures imports within each import group do not have newlines between them.

<!-- The `name` configuration plays an important part here in that all rules with the same name are considered part of a *rule group*. Rules in such groups that produce diagnostics in overlapping ranges of text behave as one rule that can match multiple rule violations and apply the corresponding fixes to text in their combined ranges. -->

The following is a simple configuration that issues diagnostics for maximum characters exceeded in a line:

```jsonc
{
    ...
    "dryerLint.ruleSets": [
        {
            "name": "Column Width Example",
            "language": ["python", "javascript", "typescript"],
            "rules": [
                {
                    "message": "format: 80 columns exceeded",
                    "name": "format-line",
                    "pattern": "^.{81,120}$",
                    "severity": "Warning"
                },
                {
                    "message": "format: 120 columns exceeded",
                    "name": "format-line",
                    "pattern": "^.{121,}$",
                    "severity": "Error"
                }
            ]
        }
    ]
    ...
}
```

# Development

This section describes how to set up Dryer Lint for development.

Install Node.js and the Node Package Manager:

1. Download and install Node.js (LTS version recommended).
1. The Node Package Manager (`npm`) comes bundled with Node.js.

After installing NPM, clone this repository and open it in VS Code.
Then, to install the Node.js dependencies listed in `package.json`, run the following command within the root directory of the repo. 
```
npm install
```
Once you have all of the dependencies, you should be able to build this extension using 
```
npm run compile
```
in the root of this repository.

To see the console output of Dryer Lint, open the VS Code “Output” panel and select “Dryer Lint” from the dropdown.

<!-- The configuration options can be found in the `contributes.configuration` section of the [`package.json`](package.json). -->

## Test Extension in another Workspace 
To run this extension in a workspace—without building and installing a VS Code extension package globally—follow these steps:

0. Open the workspace where you want to test Dryer Lint.
1. Create `.vscode/extension` as a directory relative to the root of your workspace (if it does not already exist). 
2. Clone Dryer Lint into `.vscode/extension`. The resulting path should be `.vscode/extension/dryer-lint`. 
3. Change your working directory to `.vscode/extension/dryer-lint` and run `npm install` (as described in the previous section) to install all of Dryer Lint's dependencies. 
4. Run `npm run compile` to compile the project.
5. Open the Extensions panel and select “Dryer Lint” from the “Recommended” subpanel. Click “Install Workspace Extension.”
6. Run `Developer: Restart Extension Host` in the VS Code Command window (`CTRL+SHIFT+P`, by default on Windows).

To update the extension after changing the code, repeat steps 4 and 6 (`npm run compile` and run `Developer: Restart Extension Host`).

## Packaging the Extension

Dryer Lint is packaged and published used the VS Code Extension Manager tool, `vsce`.
To install `vsce`, run, 
```
npm install -g @vscode/vsce
```
Then, within the root of this project, create a package with 
```
vsce package
```
and publish a new `major`, `minor`, or `patch` version with
```
vsce publish [major/minor/path]
```

### Development notes
When change the "contributes"/"configuration" in `package.json`, you need to reload the VS Code window for IntelliCode to update its autocompletion in the `settings.json` file.