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
exports.SessionFactory = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const session_js_1 = require("ts-php-debug-mcp/session.js");
const dap_client_js_1 = require("ts-php-debug-mcp/dap-client.js");
const path_mapper_js_1 = require("ts-php-debug-mcp/path-mapper.js");
const breakpoint_ledger_js_1 = require("ts-php-debug-mcp/breakpoint-ledger.js");
const debug_launch_js_1 = require("ts-php-debug-mcp/tools/debug-launch.js");
const debug_terminate_js_1 = require("ts-php-debug-mcp/tools/debug-terminate.js");
const vscode_debug_backend_js_1 = require("./vscode-debug-backend.js");
/**
 * Central infrastructure class for debug session lifecycle management.
 * Manages the singleton SessionManager, constructs Config by merging
 * tool params → VS Code settings → hardcoded defaults, creates backends,
 * and owns a BreakpointLedger per session.
 * (Requirements 6.1–6.7, 8.1, 8.3, 18.1–18.6)
 */
class SessionFactory {
    notifier;
    outputChannel;
    session = null;
    backend = null;
    breakpointLedger = null;
    constructor(notifier, outputChannel) {
        this.notifier = notifier;
        this.outputChannel = outputChannel;
    }
    /**
     * Launch a new debug session. Terminates any existing session first
     * (singleton invariant). Builds Config, resolves adapter path, creates
     * backend, PathMapper, BreakpointLedger, and SessionManager, then
     * delegates to handleDebugLaunch().
     */
    async launch(params) {
        // Singleton invariant: terminate existing session if active (Req 6.5)
        if (this.session) {
            await this.terminate();
        }
        // 1. Build Config by merging: tool params → VS Code settings → defaults
        const config = this.buildConfig(params);
        // 2. Resolve debugAdapterPath (Req 18.3, 18.4)
        const adapterPath = this.resolveDebugAdapterPath();
        // 3. Create backend based on backendMode (Req 5.1–5.3)
        const backendMode = params.backendMode ?? 'ui';
        this.backend = backendMode === 'headless'
            ? new dap_client_js_1.DAPClient(adapterPath)
            : new vscode_debug_backend_js_1.VsCodeDebugBackend();
        // 4. Create PathMapper from pathMappings (Record<server, local> → PathMapping[])
        const pathMapper = new path_mapper_js_1.PathMapper(Object.entries(config.pathMappings).map(([remote, local]) => ({ remote, local })));
        // 5. Create BreakpointLedger for this session (Req 18.6)
        this.breakpointLedger = new breakpoint_ledger_js_1.BreakpointLedger(this.backend, pathMapper);
        // 6. Create SessionManager (Req 6.1, 6.2)
        this.session = new session_js_1.SessionManager(config, this.backend, pathMapper, this.notifier);
        // 7. Delegate to handleDebugLaunch (Req 6.3)
        return await (0, debug_launch_js_1.handleDebugLaunch)(this.session, params);
    }
    /**
     * Terminate the active session and release all resources.
     * (Req 6.4)
     */
    async terminate() {
        if (!this.session) {
            return {
                success: false,
                error: { message: 'No active session', code: 'SESSION_NOT_STARTED' },
            };
        }
        const result = await (0, debug_terminate_js_1.handleDebugTerminate)(this.session);
        this.session = null;
        this.backend = null;
        this.breakpointLedger = null;
        return result;
    }
    /**
     * Build a complete Config by merging three tiers:
     * 1. Tool parameters (highest priority)
     * 2. VS Code workspace settings (agenticDebug.*)
     * 3. Hardcoded defaults (lowest priority)
     * (Req 18.1, 18.5)
     */
    buildConfig(params) {
        const settings = vscode.workspace.getConfiguration('agenticDebug');
        const adapterPath = this.resolveDebugAdapterPath();
        return {
            adapterPath,
            port: params.port ?? settings.get('port') ?? 9003,
            hostname: settings.get('hostname') ?? '127.0.0.1',
            stopOnEntry: params.stopOnEntry ?? settings.get('stopOnEntry') ?? true,
            pathMappings: params.pathMappings ?? settings.get('pathMappings') ?? {},
            maxConnections: settings.get('maxConnections') ?? 0,
            // Hardcoded defaults — not exposed as VS Code settings (Req 18.5)
            runtimeExecutable: 'php',
            log: false,
            xdebugSettings: {},
        };
    }
    /**
     * Locate the xdebug.php-debug extension's phpDebug.js adapter binary.
     * (Req 18.3, 18.4)
     */
    resolveDebugAdapterPath() {
        const ext = vscode.extensions.getExtension('xdebug.php-debug');
        if (!ext) {
            throw new Error('xdebug.php-debug extension is required but not installed. ' +
                'Please install it from the VS Code marketplace.');
        }
        return path.join(ext.extensionPath, 'out', 'phpDebug.js');
    }
}
exports.SessionFactory = SessionFactory;
//# sourceMappingURL=session-factory.js.map