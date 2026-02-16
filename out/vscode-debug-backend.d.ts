import * as vscode from 'vscode';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { DebugBackend, EventHandler } from 'ts-php-debug-mcp/debug-backend.js';
import type { AgentSessionEntry } from './types.js';
/**
 * Returns true if the given debug session was initiated by the agent.
 * After DebugConfigurationProvider transforms php-agent → php, the
 * session.type is 'php', so we check for the __agentInitiated marker.
 */
export declare function isAgentSession(session: vscode.DebugSession): boolean;
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
export declare class VsCodeDebugBackend implements DebugBackend {
    private readonly workspaceFolder?;
    private session;
    private disposables;
    private eventHandlers;
    private anyEventHandlers;
    private alive;
    private seq;
    /** Agent session tracking Map keyed by vscode.DebugSession.id (Requirement 15.5). */
    private agentSessions;
    onTrace: ((direction: 'send' | 'recv', msg: DebugProtocol.ProtocolMessage) => void) | null;
    onStderr: ((text: string) => void) | null;
    constructor(workspaceFolder?: vscode.WorkspaceFolder | undefined);
    initialize(): Promise<DebugProtocol.InitializeResponse>;
    launch(config: DebugProtocol.LaunchRequestArguments): Promise<DebugProtocol.LaunchResponse>;
    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse>;
    sendRequest<T extends DebugProtocol.Response>(command: string, args?: object): Promise<T>;
    disconnect(): Promise<void>;
    onEvent(eventName: string, handler: EventHandler): void;
    onAnyEvent(handler: EventHandler): void;
    waitForEvent(eventName: string, timeout?: number): Promise<DebugProtocol.Event>;
    isAlive(): boolean;
    getStatus(): {
        alive: boolean;
        pid?: number;
        exitCode?: number;
        sessionId?: string;
    };
    getSeq(): number;
    /** Expose tracked agent sessions for testing/inspection. */
    getAgentSessions(): ReadonlyMap<string, AgentSessionEntry>;
    /**
     * Build a debug configuration with type 'php-agent' and __agentInitiated marker.
     * The DebugConfigurationProvider will transform php-agent → php at launch time.
     * (Requirement 15.3)
     */
    private buildDebugConfig;
    private awaitSessionStart;
    private syntheticResponse;
    /** Requirement 15.6: store agent session context on start. */
    private handleSessionStart;
    /** Requirement 15.7: clean up agent session on terminate. */
    private handleSessionTerminate;
    /** Requirement 15.9: translate custom events to DebugProtocol.Event. */
    private handleCustomEvent;
    private emitEvent;
}
