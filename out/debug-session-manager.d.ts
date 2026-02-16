import * as vscode from 'vscode';
/**
 * Lightweight wrapper around a VS Code debug session.
 * Tracks session state by listening to VS Code debug events and
 * proxies DAP requests via session.customRequest().
 *
 * No custom debug type, no config provider, no adapter — just
 * reuses xdebug.php-debug natively.
 */
export type SessionState = 'not_started' | 'launching' | 'listening' | 'connected' | 'paused' | 'terminated';
export interface StopInfo {
    reason: string;
    threadId: number;
    description?: string;
    allThreadsStopped?: boolean;
}
export declare class DebugSessionManager {
    private readonly outputChannel;
    private session;
    private disposables;
    private _state;
    private _stopInfo;
    constructor(outputChannel: vscode.OutputChannel);
    get state(): SessionState;
    get stopInfo(): StopInfo | undefined;
    get activeSession(): vscode.DebugSession | null;
    /**
     * Start a new debug session by calling vscode.debug.startDebugging
     * with type: "php". xdebug.php-debug handles everything — config,
     * pathMappings, adapter lifecycle.
     */
    launch(params: {
        port?: number;
        pathMappings?: Record<string, string>;
        stopOnEntry?: boolean;
        hostname?: string;
        log?: boolean;
    }): Promise<void>;
    /** Terminate the active debug session. */
    terminate(): Promise<void>;
    /** Send a DAP request through the active session. */
    customRequest(command: string, args?: object): Promise<any>;
    private setState;
    /**
     * Scan workspace launch.json for a PHP debug config that has pathMappings.
     * Returns the first non-empty pathMappings found, or undefined.
     */
    private getPathMappingsFromLaunchJson;
    private registerEventListeners;
    private awaitSessionStart;
    private disposeListeners;
    private cleanup;
    dispose(): void;
}
