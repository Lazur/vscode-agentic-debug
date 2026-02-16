import type * as vscode from 'vscode';

/**
 * DebugConfigurationProvider for the `php-agent` debug type.
 * Transforms `php-agent` configurations to `php` so that xdebug.php-debug
 * handles the actual debugging. Adds `__agentInitiated` marker for
 * event handler filtering, and strips agent-specific fields.
 * (Requirements 15.2, 15.3, 15.4)
 */
export class PhpAgentConfigProvider implements vscode.DebugConfigurationProvider {
  private outputChannel: vscode.OutputChannel | undefined;

  setOutputChannel(channel: vscode.OutputChannel): void {
    this.outputChannel = channel;
  }

  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    const { backendMode, agentSessionId, ...rest } = config as vscode.DebugConfiguration & {
      backendMode?: string;
      agentSessionId?: string;
    };

    const resolved: vscode.DebugConfiguration = {
      ...rest,
      type: 'php',
      __agentInitiated: true,
    };

    this.outputChannel?.appendLine(
      `[PhpAgentConfigProvider] resolveDebugConfiguration input: ${JSON.stringify(config)}`,
    );
    this.outputChannel?.appendLine(
      `[PhpAgentConfigProvider] resolveDebugConfiguration output: ${JSON.stringify(resolved)}`,
    );

    return resolved;
  }

  resolveDebugConfigurationWithSubstitutedVariables(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    this.outputChannel?.appendLine(
      `[PhpAgentConfigProvider] afterSubstitution: ${JSON.stringify(config)}`,
    );
    return config;
  }
}
