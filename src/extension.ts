import * as vscode from 'vscode';
import activateDiagnostics from './diagnostics';
import activateFixes from './fixes';
import Rule from './rule';

let outputChannel: vscode.OutputChannel;
export function activate(context: vscode.ExtensionContext) {
    // Create a dedicated output channel
    outputChannel = vscode.window.createOutputChannel("Dryer Lint");

    // Create the list of rules.
    Rule.loadAll();

    activateFixes(context);
    activateDiagnostics(context);
}

export function deactivate() {
    outputChannel.appendLine("Dryer Lint is shutting down.");
    outputChannel.dispose();
}

// Function to log messages to the custom output channel
export function dryerLintLog(message: string) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}