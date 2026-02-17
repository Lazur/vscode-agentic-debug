import type * as vscode from 'vscode';
import type { NotificationSender } from 'ts-php-debug-mcp/session.js';

/**
 * NotificationSender implementation for the VS Code extension context.
 * Logs to an output channel and updates a status bar item for debug events.
 * (Requirements 9.1–9.7)
 */
export class VsCodeNotificationSender implements NotificationSender {
  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBarItem: vscode.StatusBarItem,
  ) {}

  async sendProgress(
    _token: string | number,
    progress: number,
    total?: number,
    message?: string,
  ): Promise<void> {
    this.outputChannel.appendLine(
      `[progress] ${message ?? ''} (${progress}/${total ?? '?'})`,
    );
  }

  async sendLog(
    level: string,
    message: string,
    _data?: unknown,
  ): Promise<void> {
    this.outputChannel.appendLine(`[${level}] ${message}`);
  }

  async sendDebugEvent(
    event: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    this.outputChannel.appendLine(
      `[event:${event}] ${JSON.stringify(details)}`,
    );

    if (event === 'stopped') {
      this.statusBarItem.text =
        `$(debug-pause) Paused: ${details.reason} (thread ${details.threadId})`;
      this.statusBarItem.show();
    } else if (event === 'continued') {
      this.statusBarItem.text = '$(debug-continue) Running';
    } else if (event === 'terminated') {
      this.statusBarItem.hide();
    }
  }
}
