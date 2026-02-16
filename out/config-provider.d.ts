import type * as vscode from 'vscode';
/**
 * DebugConfigurationProvider for the `php-agent` debug type.
 * Transforms `php-agent` configurations to `php` so that xdebug.php-debug
 * handles the actual debugging. Adds `__agentInitiated` marker for
 * event handler filtering, and strips agent-specific fields.
 * (Requirements 15.2, 15.3, 15.4)
 */
export declare class PhpAgentConfigProvider implements vscode.DebugConfigurationProvider {
    private outputChannel;
    setOutputChannel(channel: vscode.OutputChannel): void;
    resolveDebugConfiguration(_folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration>;
    resolveDebugConfigurationWithSubstitutedVariables(_folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration>;
}
