import * as vscode from 'vscode';
import activateDiagnostics from './diagnostics';
import Rule from './rule';
import activateFixes, { fixAllInActiveFile } from './fixes';

let outputChannel: vscode.OutputChannel;
export function activate(context: vscode.ExtensionContext) {
    // Create a dedicated output channel
    outputChannel = vscode.window.createOutputChannel("Dryer Lint", {log: true});

    // Create the list of rules.
    Rule.loadAll();

    activateFixes(context);
    activateDiagnostics(context);

    context.subscriptions.push(vscode.commands.registerCommand('dryerLint.fixAllInActiveFile',  fixAllInActiveFile));

}

export function deactivate() {
    outputChannel.appendLine("Dryer Lint is shutting down.");
    outputChannel.dispose();
}

// Function to log messages to the custom output channel
export function dryerLintLog(message: string) {
    // outputChannel.appendLine(`${new Date().toLocaleTimeString()} ${message}`);
    outputChannel.appendLine(`${message}`);
}

// Function to log messages to the custom output channel
export function log(message: string) {
    outputChannel.appendLine(`${new Date().toLocaleTimeString()} - ${message}`);
}

export function error(message: string, withTrace: boolean = false) {
    if (withTrace) {
        const targetObject = {"stack": []};
        Error.captureStackTrace(targetObject);
        outputChannel.appendLine(`ERROR [${new Date().toLocaleTimeString()}] ${message}\nStacktrace ${targetObject.stack}`);
    } else {
        outputChannel.appendLine(`ERROR [${new Date().toLocaleTimeString()}] ${message}`);
    }
}    
