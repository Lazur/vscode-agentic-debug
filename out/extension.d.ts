import * as vscode from 'vscode';
/**
 * Extension activation entry point.
 * Creates shared infrastructure (output channel, status bar, notifier, SessionFactory),
 * registers the php-agent DebugConfigurationProvider, and conditionally registers
 * 15 LM Tools if the API is available.
 * (Requirements 1.1–1.4, 2.1, 2.3, 6.7)
 */
export declare function activate(context: vscode.ExtensionContext): void;
/**
 * Extension deactivation. Terminates any active session.
 * (Requirement 6.4)
 */
export declare function deactivate(): Promise<void>;
