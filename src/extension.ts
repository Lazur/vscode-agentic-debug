import * as vscode from 'vscode';
import { SessionFactory } from './session-factory.js';
import { VsCodeNotificationSender } from './notification-sender.js';
import { PhpAgentConfigProvider } from './config-provider.js';
import { registerAllLmTools } from './lm-tools.js';

let sessionFactory: SessionFactory | undefined;

/**
 * Extension activation entry point.
 * Creates shared infrastructure (output channel, status bar, notifier, SessionFactory),
 * registers the php-agent DebugConfigurationProvider, and conditionally registers
 * 15 LM Tools if the API is available.
 * (Requirements 1.1–1.4, 2.1, 2.3, 6.7)
 */
export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Agentic Debug');
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  const notifier = new VsCodeNotificationSender(outputChannel, statusBarItem);
  sessionFactory = new SessionFactory(notifier, outputChannel);

  // Register php-agent debug configuration provider
  const configProvider = new PhpAgentConfigProvider();
  configProvider.setOutputChannel(outputChannel);
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('php-agent', configProvider),
  );

  // Log the actual session configuration when a debug session starts
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'php' || session.configuration?.type === 'php') {
        outputChannel.appendLine(
          `[DebugSession] Started: ${session.name} (type=${session.type})`,
        );
        outputChannel.appendLine(
          `[DebugSession] Configuration: ${JSON.stringify(session.configuration)}`,
        );
        const pm = session.configuration?.pathMappings;
        outputChannel.appendLine(
          `[DebugSession] pathMappings present: ${pm !== undefined}, value: ${JSON.stringify(pm)}`,
        );
      }
    }),
  );

  // Runtime check: LM Tools API availability (Req 1.1–1.3)
  if (typeof vscode.lm?.registerTool === 'function') {
    registerAllLmTools(context, sessionFactory);
  } else {
    outputChannel.appendLine(
      '[WARN] vscode.lm.registerTool not available — LM tool registration skipped',
    );
  }

  // Push disposables
  context.subscriptions.push(outputChannel, statusBarItem);
}

/**
 * Extension deactivation. Terminates any active session.
 * (Requirement 6.4)
 */
export async function deactivate(): Promise<void> {
  if (sessionFactory) {
    await sessionFactory.terminate();
    sessionFactory = undefined;
  }
}
