import * as vscode from 'vscode';
import activateDiagnostics from './diagnostics';
import Rule from './rule';
import activateFixes, { fixAllInActiveFile } from './fixes';

let outputChannel: vscode.LogOutputChannel;
export function activate(context: vscode.ExtensionContext) {
    // Create a dedicated output channel
    outputChannel = vscode.window.createOutputChannel("Dryer Lint", {log: true});

    try {
        // Create the list of rules.
        Rule.loadAll();
    } catch (e) {
        logErrorObj(`Error in extension activation while loading rules`, e)
    }
        
    try {
        activateFixes(context);
    } catch (e) {
        logErrorObj(`Error in extension activation while activating fixes`, e)
    }

    try {
        activateDiagnostics(context);
    } catch (e) {
        logErrorObj(`Error in extension activation while activating diagnostics`, e)
    }
        
    context.subscriptions.push(vscode.commands.registerCommand('dryerLint.fixAllInActiveFile', fixAllInActiveFile));
}

export function deactivate() {
    outputChannel.appendLine("Dryer Lint is shutting down.");
    outputChannel.dispose();
}

// ╭───────────────────────────────────────────────╮
// │ ╭───────────────────────────────────────────╮ │
// │ │             Logging Functions             │ │
// │ ╰───────────────────────────────────────────╯ │
// ╰───────────────────────────────────────────────╯

export function logTrace(message: string) {
    // Log very verbose messages.
    // Will be included in log if the log level is at or above "Trace". To change the log level, select "Developer: Set Log Level..." from the command palette. 
    outputChannel.trace(`${message}`);
}

export function logDebug(message: string) {
    // Log somewhat verbose messages.
    // Will be included in log if the log level is at or above "Debug". To change the log level, select "Developer: Set Log Level..." from the command palette. 
    outputChannel.debug(`${message}`);
}

export function logInfo(message: string) {
    // Log important events, such as reloading settings, or triggering a refresh of a file's diagnostics.
    // Will be included in log if the log level is at or above "Info". To change the log level, select "Developer: Set Log Level..." from the command palette. 
    outputChannel.info(`${message}`);
}

export function logWarn(message: string) {
    // Log warnings (non-fatal problems).
    // Will be included in log if the log level is at or above "Warning". To change the log level, select "Developer: Set Log Level..." from the command palette. 
    outputChannel.warn(`${message}`);
}

export function logErrorObj(message: string, err: any) {
    var error: Error | undefined;
    try {
        error = err as Error;
        outputChannel.error(`${message}\n:\n${error.stack}`);
    } catch (castingErr) {
        outputChannel.error(`${message}\nError: "${error}"\nFailed to get stacktrace because we were unable to cast 'err' to Error (casting error: "${castingErr}").`);
    }
}    

export function logErrorMsg(message: string, withTrace: boolean = false) {
    if (withTrace) {
        const targetObject = {"stack": []};
        Error.captureStackTrace(targetObject);
        outputChannel.error(`${message}\nStacktrace:\n${targetObject.stack}`);
    } else {
        outputChannel.error(`${message}`);
    }
}    
