"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhpAgentConfigProvider = void 0;
/**
 * DebugConfigurationProvider for the `php-agent` debug type.
 * Transforms `php-agent` configurations to `php` so that xdebug.php-debug
 * handles the actual debugging. Adds `__agentInitiated` marker for
 * event handler filtering, and strips agent-specific fields.
 * (Requirements 15.2, 15.3, 15.4)
 */
class PhpAgentConfigProvider {
    outputChannel;
    setOutputChannel(channel) {
        this.outputChannel = channel;
    }
    resolveDebugConfiguration(_folder, config, _token) {
        const { backendMode, agentSessionId, ...rest } = config;
        const resolved = {
            ...rest,
            type: 'php',
            __agentInitiated: true,
        };
        this.outputChannel?.appendLine(`[PhpAgentConfigProvider] resolveDebugConfiguration input: ${JSON.stringify(config)}`);
        this.outputChannel?.appendLine(`[PhpAgentConfigProvider] resolveDebugConfiguration output: ${JSON.stringify(resolved)}`);
        return resolved;
    }
    resolveDebugConfigurationWithSubstitutedVariables(_folder, config, _token) {
        this.outputChannel?.appendLine(`[PhpAgentConfigProvider] afterSubstitution: ${JSON.stringify(config)}`);
        return config;
    }
}
exports.PhpAgentConfigProvider = PhpAgentConfigProvider;
//# sourceMappingURL=config-provider.js.map