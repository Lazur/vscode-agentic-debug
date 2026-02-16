"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VsCodeDebugBackend = void 0;
exports.isAgentSession = isAgentSession;
const vscode = __importStar(require("vscode"));
/**
 * Fields that vscode-php-debug understands in a launch configuration.
 * Used to filter out internal fields that would cause startDebugging to fail.
 */
const PHP_DEBUG_FIELDS = new Set([
    'port', 'hostname', 'stopOnEntry', 'pathMappings', 'program', 'args',
    'cwd', 'runtimeExecutable', 'runtimeArgs', 'env', 'envFile',
    'xdebugSettings', 'maxConnections', 'log', 'noDebug', 'skipFiles',
    'skipEntryPaths', 'ignore', 'ignoreExceptions', 'proxy', 'stream',
    'xdebugCloudToken',
]);
/**
 * Returns true if the given debug session was initiated by the agent.
 * After DebugConfigurationProvider transforms php-agent → php, the
 * session.type is 'php', so we check for the __agentInitiated marker.
 */
function isAgentSession(session) {
    return session.type === 'php' &&
        session.configuration.__agentInitiated === true;
}
/**
 * DebugBackend that routes DAP operations through the VS Code debug API
 * using the custom `php-agent` debug type.
 *
 * The developer sees the full native debug experience (gutter breakpoints,
 * pause line, variable panel, call stack) while the agent maintains
 * programmatic control via LM Tools.
 *
 * Event bridging: VS Code debug events are translated into
 * DebugProtocol.Event objects and dispatched to registered handlers,
 * so SessionManager works identically with either backend.
 *
 * Copied from vscode-debug-bridge POC and modified for php-agent type,
 * __agentInitiated marker, and agent session tracking.
 * (Requirements 15.3, 15.5–15.11)
 */
class VsCodeDebugBackend {
    workspaceFolder;
    session = null;
    disposables = [];
    eventHandlers = new Map();
    anyEventHandlers = [];
    alive = false;
    seq = 1;
    /** Agent session tracking Map keyed by vscode.DebugSession.id (Requirement 15.5). */
    agentSessions = new Map();
    onTrace = null;
    onStderr = null;
    constructor(workspaceFolder) {
        this.workspaceFolder = workspaceFolder;
    }
    async initialize() {
        this.disposables.push(vscode.debug.onDidStartDebugSession((s) => this.handleSessionStart(s)), vscode.debug.onDidTerminateDebugSession((s) => this.handleSessionTerminate(s)), vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => this.handleCustomEvent(e)));
        return this.syntheticResponse('initialize', {
            supportsConfigurationDoneRequest: true,
            supportsFunctionBreakpoints: true,
            supportsConditionalBreakpoints: true,
            supportsHitConditionalBreakpoints: true,
            supportsEvaluateForHovers: true,
            supportsSetVariable: true,
        });
    }
    async launch(config) {
        // If an agent session is already running, attach to it (Requirement 15.11).
        if (this.session && this.alive) {
            this.emitEvent('initialized', {});
            return this.syntheticResponse('launch');
        }
        const debugConfig = this.buildDebugConfig(config);
        const sessionReady = this.awaitSessionStart();
        let started = await vscode.debug.startDebugging(this.workspaceFolder ?? undefined, debugConfig);
        if (!started) {
            started = await vscode.debug.startDebugging(undefined, debugConfig);
        }
        if (!started) {
            throw new Error('Failed to start VS Code debug session');
        }
        await sessionReady;
        this.emitEvent('initialized', {});
        return this.syntheticResponse('launch');
    }
    async configurationDone() {
        if (this.session) {
            try {
                await this.session.customRequest('configurationDone');
            }
            catch { /* already done */ }
        }
        return this.syntheticResponse('configurationDone');
    }
    async sendRequest(command, args) {
        if (!this.session)
            throw new Error('No active debug session');
        const request = {
            seq: this.seq++,
            type: 'request',
            command,
            ...(args !== undefined ? { arguments: args } : {}),
        };
        this.onTrace?.('send', request);
        const body = await this.session.customRequest(command, args);
        const response = {
            seq: this.seq++,
            type: 'response',
            request_seq: request.seq,
            command,
            success: true,
            body,
        };
        this.onTrace?.('recv', response);
        return response;
    }
    async disconnect() {
        if (this.session) {
            await vscode.debug.stopDebugging(this.session);
        }
        this.alive = false;
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
    }
    onEvent(eventName, handler) {
        const handlers = this.eventHandlers.get(eventName) ?? [];
        handlers.push(handler);
        this.eventHandlers.set(eventName, handlers);
    }
    onAnyEvent(handler) {
        this.anyEventHandlers.push(handler);
    }
    waitForEvent(eventName, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for event "${eventName}" after ${timeout}ms`));
            }, timeout);
            const handler = (event) => {
                cleanup();
                resolve(event);
            };
            const cleanup = () => {
                clearTimeout(timer);
                const handlers = this.eventHandlers.get(eventName);
                if (handlers) {
                    const idx = handlers.indexOf(handler);
                    if (idx !== -1)
                        handlers.splice(idx, 1);
                }
            };
            this.onEvent(eventName, handler);
        });
    }
    isAlive() {
        return this.alive;
    }
    getStatus() {
        return { alive: this.alive, sessionId: this.session?.id };
    }
    getSeq() {
        return this.seq;
    }
    /** Expose tracked agent sessions for testing/inspection. */
    getAgentSessions() {
        return this.agentSessions;
    }
    // --- Private helpers ---
    /**
     * Build a debug configuration with type 'php-agent' and __agentInitiated marker.
     * The DebugConfigurationProvider will transform php-agent → php at launch time.
     * (Requirement 15.3)
     */
    buildDebugConfig(config) {
        const filtered = {};
        for (const [key, value] of Object.entries(config)) {
            if (value !== undefined && PHP_DEBUG_FIELDS.has(key)) {
                filtered[key] = value;
            }
        }
        return {
            type: 'php-agent',
            name: 'Agentic Debug Session',
            request: 'launch',
            __agentInitiated: true,
            ...filtered,
        };
    }
    awaitSessionStart(timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                disposable.dispose();
                reject(new Error('Timeout waiting for debug session to start'));
            }, timeoutMs);
            const disposable = vscode.debug.onDidStartDebugSession((s) => {
                if (isAgentSession(s)) {
                    clearTimeout(timeout);
                    disposable.dispose();
                    this.session = s;
                    this.alive = true;
                    resolve();
                }
            });
        });
    }
    syntheticResponse(command, body) {
        return {
            seq: this.seq++,
            type: 'response',
            request_seq: 0,
            command,
            success: true,
            ...(body ? { body } : {}),
        };
    }
    // --- Event bridge ---
    /** Requirement 15.6: store agent session context on start. */
    handleSessionStart(session) {
        if (!isAgentSession(session))
            return;
        this.agentSessions.set(session.id, {
            sessionId: session.id,
            backendMode: 'ui',
            launchTimestamp: Date.now(),
            debugSession: session,
        });
        if (!this.session) {
            this.session = session;
            this.alive = true;
            this.emitEvent('initialized', {});
        }
    }
    /** Requirement 15.7: clean up agent session on terminate. */
    handleSessionTerminate(session) {
        this.agentSessions.delete(session.id);
        if (session !== this.session)
            return;
        this.alive = false;
        this.emitEvent('terminated', {});
        this.session = null;
    }
    /** Requirement 15.9: translate custom events to DebugProtocol.Event. */
    handleCustomEvent(e) {
        if (e.session !== this.session)
            return;
        this.emitEvent(e.event, e.body ?? {});
    }
    emitEvent(eventName, body) {
        const event = {
            seq: this.seq++,
            type: 'event',
            event: eventName,
            body,
        };
        for (const handler of [...(this.eventHandlers.get(eventName) ?? [])]) {
            handler(event);
        }
        for (const handler of this.anyEventHandlers) {
            handler(event);
        }
    }
}
exports.VsCodeDebugBackend = VsCodeDebugBackend;
//# sourceMappingURL=vscode-debug-backend.js.map