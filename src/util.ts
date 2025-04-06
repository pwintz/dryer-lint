import * as vscode from 'vscode';

export function sortedIndex<T>(sortedArray: T[], item: T, comparator: (a: T, b: T) => boolean) {
    let lo = 0;
    let hi = sortedArray.length;

    while (lo < hi) {
        let mid = (lo + hi) >>> 1;
        if (comparator(sortedArray[mid], item)) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

export function rangeToString(range: vscode.Range): string {
    return `${positionToString(range.start)}-${positionToString(range.start)}`;
}

export function positionToString(position: vscode.Position): string {
    return `${position.line}:${position.character}`;
}

const commentChars: Record<string, string> = {
    c: "//",
    cpp: "//",
    java: "//",
    javascript: "//",
    latex: "%",
    python: "#",
    ruby: "#",
    shellscript: "#",
    typescript: "//"
};

export function getLineCommentChar(document: vscode.TextDocument): string | undefined {
    return commentChars[document.languageId];
}