"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VsCodeNotificationSender = void 0;
/**
 * NotificationSender implementation for the VS Code extension context.
 * Logs to an output channel and updates a status bar item for debug events.
 * (Requirements 9.1–9.7)
 */
class VsCodeNotificationSender {
    outputChannel;
    statusBarItem;
    constructor(outputChannel, statusBarItem) {
        this.outputChannel = outputChannel;
        this.statusBarItem = statusBarItem;
    }
    async sendProgress(_token, progress, total, message) {
        this.outputChannel.appendLine(`[progress] ${message ?? ''} (${progress}/${total ?? '?'})`);
    }
    async sendLog(level, message, _data) {
        this.outputChannel.appendLine(`[${level}] ${message}`);
    }
    async sendDebugEvent(event, details) {
        this.outputChannel.appendLine(`[event:${event}] ${JSON.stringify(details)}`);
        if (event === 'stopped') {
            this.statusBarItem.text =
                `$(debug-pause) Paused: ${details.reason} (thread ${details.threadId})`;
            this.statusBarItem.show();
        }
        else if (event === 'continued') {
            this.statusBarItem.text = '$(debug-continue) Running';
        }
        else if (event === 'terminated') {
            this.statusBarItem.hide();
        }
    }
}
exports.VsCodeNotificationSender = VsCodeNotificationSender;
//# sourceMappingURL=notification-sender.js.map