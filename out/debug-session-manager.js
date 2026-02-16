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
exports.DebugSessionManager = void 0;
const vscode = __importStar(require("vscode"));
class DebugSessionManager {
    outputChannel;
    session = null;
    disposables = [];
    _state = 'not_started';
    _stopInfo;
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    get state() { return this._state; }
    get stopInfo() { return this._stopInfo; }
    get activeSession() { return this.session; }
    /**
     * Start a new debug session by calling vscode.debug.startDebugging
     * with type: "php". xdebug.php-debug handles everything — config,
     * pathMappings, adapter lifecycle.
     */
    async launch(params) {
        // Terminate existing session if any
        if (this.session) {
            await this.terminate();
        }
        this.registerEventListeners();
        this.setState('launching');
        // Merge: agent params → VS Code settings → launch.json → defaults
        // Use a helper that treats empty objects ({}) the same as undefined,
        // because the agent often sends pathMappings: {} when it means "use defaults".
        const settings = vscode.workspace.getConfiguration('agenticDebug');
        const nonEmpty = (m) => m && Object.keys(m).length > 0 ? m : undefined;
        const resolvedPathMappings = nonEmpty(params.pathMappings)
            ?? nonEmpty(settings.get('pathMappings'))
            ?? this.getPathMappingsFromLaunchJson()
            ?? {};
        const config = {
            type: 'php',
            name: 'Agentic Debug Session',
            request: 'launch',
            port: params.port ?? settings.get('port') ?? 9003,
            hostname: params.hostname ?? settings.get('hostname') ?? '127.0.0.1',
            stopOnEntry: params.stopOnEntry ?? settings.get('stopOnEntry') ?? true,
            pathMappings: resolvedPathMappings,
            maxConnections: settings.get('maxConnections') ?? 0,
            log: params.log ?? false,
        };
        this.outputChannel.appendLine(`[launch] Starting debug session with config: ${JSON.stringify(config)}`);
        const sessionReady = this.awaitSessionStart();
        const folder = vscode.workspace.workspaceFolders?.[0];
        let started = await vscode.debug.startDebugging(folder, config);
        if (!started) {
            started = await vscode.debug.startDebugging(undefined, config);
        }
        if (!started) {
            this.setState('not_started');
            throw new Error('Failed to start VS Code debug session');
        }
        await sessionReady;
        this.setState('listening');
    }
    /** Terminate the active debug session. */
    async terminate() {
        if (this.session) {
            await vscode.debug.stopDebugging(this.session);
        }
        this.cleanup();
    }
    /** Send a DAP request through the active session. */
    async customRequest(command, args) {
        if (!this.session) {
            throw new Error('No active debug session');
        }
        return this.session.customRequest(command, args);
    }
    // --- Private helpers ---
    setState(state) {
        const old = this._state;
        this._state = state;
        this.outputChannel.appendLine(`[state] ${old} → ${state}`);
    }
    /**
     * Scan workspace launch.json for a PHP debug config that has pathMappings.
     * Returns the first non-empty pathMappings found, or undefined.
     */
    getPathMappingsFromLaunchJson() {
        const launchConfig = vscode.workspace.getConfiguration('launch');
        const configurations = launchConfig.get('configurations');
        if (!configurations)
            return undefined;
        for (const cfg of configurations) {
            if (cfg.type === 'php' && cfg.pathMappings && Object.keys(cfg.pathMappings).length > 0) {
                this.outputChannel.appendLine(`[launch] Using pathMappings from launch.json config "${cfg.name}": ${JSON.stringify(cfg.pathMappings)}`);
                return cfg.pathMappings;
            }
        }
        return undefined;
    }
    registerEventListeners() {
        // Clean up any previous listeners
        this.disposeListeners();
        this.disposables.push(vscode.debug.onDidStartDebugSession((s) => {
            if (s === this.session || (s.type === 'php' && !this.session)) {
                this.session = s;
                this.outputChannel.appendLine(`[session] Started: ${s.name} (id=${s.id})`);
                this.outputChannel.appendLine(`[session] Config: ${JSON.stringify(s.configuration)}`);
            }
        }), vscode.debug.onDidTerminateDebugSession((s) => {
            if (s === this.session) {
                this.outputChannel.appendLine(`[session] Terminated: ${s.name}`);
                this.setState('terminated');
                this.session = null;
                this._stopInfo = undefined;
            }
        }), vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
            if (e.session !== this.session)
                return;
            if (e.event === 'stopped') {
                this._stopInfo = {
                    reason: e.body?.reason ?? 'unknown',
                    threadId: e.body?.threadId ?? 0,
                    description: e.body?.description,
                    allThreadsStopped: e.body?.allThreadsStopped,
                };
                this.setState('paused');
                this.outputChannel.appendLine(`[event] stopped: ${this._stopInfo.reason} (thread ${this._stopInfo.threadId})`);
            }
            else if (e.event === 'continued') {
                this._stopInfo = undefined;
                this.setState('connected');
            }
            else if (e.event === 'thread') {
                if (this._state === 'listening') {
                    this.setState('connected');
                }
                this.outputChannel.appendLine(`[event] thread: ${e.body?.reason} (id=${e.body?.threadId})`);
            }
        }));
    }
    awaitSessionStart(timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                disposable.dispose();
                reject(new Error('Timeout waiting for debug session to start'));
            }, timeoutMs);
            const disposable = vscode.debug.onDidStartDebugSession((s) => {
                if (s.type === 'php') {
                    clearTimeout(timeout);
                    disposable.dispose();
                    this.session = s;
                    resolve();
                }
            });
            this.disposables.push(disposable);
        });
    }
    disposeListeners() {
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
    }
    cleanup() {
        this.disposeListeners();
        this.session = null;
        this._state = 'not_started';
        this._stopInfo = undefined;
    }
    dispose() {
        this.cleanup();
    }
}
exports.DebugSessionManager = DebugSessionManager;
//# sourceMappingURL=debug-session-manager.js.map