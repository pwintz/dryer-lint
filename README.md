# **Dryer Lint**: A Do-Regex-Yourself (DRY) Linter Extension for VS Code

![Dryer Lint Logo](assets/dryer_lint_logo.png)

Dryer Lint is a language- and framework-agnostic linter for VS Code. 
Its main purpose is to serve as tooling for programming languages that do not yet have their own specialized linters.
 
Dryer Lint is based on the [`relint`](https://github.com/n0bra1n3r/relint) extension by Ryan Blonna (GitHub user [n0bra1n3r](https://github.com/n0bra1n3r)).

## Short Demo

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

![Demo1](assets/relint-demo1.gif?raw=true)

I use an awesome plugin called [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) in conjunction with this to make issues easier to spot.

## Features

Dryer Lint produces configurable diagnostics for *rule violations*, each of which are described by a [regular expression](https://www.regular-expressions.info/). Rule violations can also be assigned fixes, which are repeatedly applied until no matching rule violations are found. Fixes can perform one of two operations:

- **Replace** the matched text
- **Reorder** the matched text

The configuration options can be found in the `contributes.configuration` section of the [`package.json`](package.json).

# Usage Guide

To create a Dryer Lint linting rules, modify `.vscode/settings.json` within your workspace.  
```jsonc
"dryer-lint": {
    // Set the name of the languages where your rules apply
    "language": ["c++", "java"],
    "rules": [
        {
            // "name" is a string used to identify the rule
            "name": "My Rule",
            // "pattern" is a JavaScript regular expression that shows diagnostic when matched
            "pattern": "(apple|orange)",
            // "message" is a string to show in the "Problems" VS Code panel or other places that diagnostics are shown.
            "message": "Don't use apples or oranges. Only bananas!",
            // "fix" (optional) is a string to replace the matched pattern.
            "fix": "banana",
            // "severity" (optional) is a string that must contain one of these values: "Hint", "Information", "Warning", or "Error". The default is "Warning".
            "severity": "'Hint', 'Information', 'Warning', or 'Error'",
            // "maxLines" (optional) is a positive integer that sets the max number of lines that the pattern is checked against at one time. The default is 1 for `replace` fixes, and 0 for `reorder` fixes.
            "maxLines": 2, 
            // "caseInsensitive" (optional) is a boolean value that sets whether the regular expression uses the case insensitive flag "i". Default is false. 
            "caseInsensitive": true
        },
    ]
},
```

The `"fix"` and `"message"` fields can use replacements from the matched Regex groups.
In particular, if `"$1"` in `"fix"` or `"messages"`, then it is replaced with the contents of the first group capture, and `"$2"` is replaced with the second, and so on.
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
```
    c: "//",
    cpp: "//",
    java: "//",
    javascript: "//",
    latex: '%',
    python: "#",
    ruby: "#",
    shellscript: "#",
    typescript: "//",
```
If a language is not recognized, then lines starting with `//` or `#` are treated as comments for the purpose of toggling Dryer Lint on and off.


## More examples

The following is a more complex example that uses the **reorder** feature combined with the **replace** function to organize imports at the top of a Nim file.

```jsonc
// .vscode/settings.json
{
    ...

    "dryer-lint": {
        "language": "nim",
        "rules": [
            {
                // 1
                "fixType": "reorder_desc",
                "fix": "$1",
                "message": "organization: unordered imports",
                "name": "organization-import",
                "pattern": "^import ([.\\w]+/).+"
            },
            {
                // 2
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import \\./.+"
            },
            {
                // 2.1
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import \\.\\./.+"
            },
            {
                // 2.2
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import src/.+"
            },
            {
                // 2.3
                "fixType": "reorder_asc",
                "message": "organization: unordered import group",
                "name": "organization-import",
                "pattern": "^import std/.+"
            },
            {
                // 3
                "fix": "$1\r\n$4",
                "message": "organization: bad spacing in import group",
                "maxLines": 0,
                "name": "organization-import",
                "pattern": "(^import ([.\\w]+)/.+)(\\r\\n){2,}(^import \\2/.+)"
            },
            {
                // 4
                "fix": "$1\r\n\r\n$4",
                "message": "organization: bad spacing in import group",
                "maxLines": 0,
                "name": "organization-import",
                "pattern": "(^import ([.\\w]+)/.+)(\\r\\n|(?:\\r\\n){3,})(^import (?!\\2/).+)"
            }
        ]
    },

    ...
}
```

![Demo2](assets/relint-demo2.gif?raw=true)

This configuration performs the following fixes:

1. Order imports by root folder in descending alphabetical order,
1. order each *import group* in ascending alphabetical order,
1. ensures import groups are separated by 1 newline,
1. and finally, ensures imports within each import group do not have newlines between them.

The `name` configuration plays an important part here in that all rules with the same name are considered part of a *rule group*. Rules in such groups that produce diagnostics in overlapping ranges of text behave as one rule that can match multiple rule violations and apply the corresponding fixes to text in their combined ranges.

The following is a simple configuration that issues diagnostics for maximum characters exceeded in a line:

```jsonc
{
    ...

    [
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

    ...
}
```

# Development

This section describes how to set up relint for development.

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