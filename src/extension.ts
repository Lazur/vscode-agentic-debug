import * as vscode from 'vscode';
import { DebugSessionManager } from './debug-session-manager.js';
import { registerAllLmTools } from './lm-tools.js';

let sessionManager: DebugSessionManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Agentic Debug');

  sessionManager = new DebugSessionManager(outputChannel);

  // Register LM Tools if the API is available
  if (typeof vscode.lm?.registerTool === 'function') {
    registerAllLmTools(context, sessionManager);
  } else {
    outputChannel.appendLine(
      '[WARN] vscode.lm.registerTool not available — LM tool registration skipped',
    );
  }

  context.subscriptions.push(outputChannel);
}

export async function deactivate(): Promise<void> {
  if (sessionManager) {
    await sessionManager.terminate();
    sessionManager = undefined;
  }
}
