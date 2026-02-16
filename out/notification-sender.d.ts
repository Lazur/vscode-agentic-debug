import type * as vscode from 'vscode';
import type { NotificationSender } from 'ts-php-debug-mcp/session.js';
/**
 * NotificationSender implementation for the VS Code extension context.
 * Logs to an output channel and updates a status bar item for debug events.
 * (Requirements 9.1–9.7)
 */
export declare class VsCodeNotificationSender implements NotificationSender {
    private readonly outputChannel;
    private readonly statusBarItem;
    constructor(outputChannel: vscode.OutputChannel, statusBarItem: vscode.StatusBarItem);
    sendProgress(_token: string | number, progress: number, total?: number, message?: string): Promise<void>;
    sendLog(level: string, message: string, _data?: unknown): Promise<void>;
    sendDebugEvent(event: string, details: Record<string, unknown>): Promise<void>;
}
