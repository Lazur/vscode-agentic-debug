import * as vscode from 'vscode';
import { SessionFactory } from './session-factory.js';
import { VsCodeNotificationSender } from './notification-sender.js';
import { registerAllLmTools } from './lm-tools.js';

let sessionFactory: SessionFactory | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Agentic Debug');
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  const notifier = new VsCodeNotificationSender(outputChannel, statusBarItem);
  sessionFactory = new SessionFactory(notifier, outputChannel);

  // Register LM Tools if the API is available
  if (typeof vscode.lm?.registerTool === 'function') {
    registerAllLmTools(context, sessionFactory);
  } else {
    outputChannel.appendLine(
      '[WARN] vscode.lm.registerTool not available — LM tool registration skipped',
    );
  }

  context.subscriptions.push(outputChannel, statusBarItem);
}

export async function deactivate(): Promise<void> {
  if (sessionFactory) {
    await sessionFactory.terminate();
    sessionFactory = undefined;
  }
}
