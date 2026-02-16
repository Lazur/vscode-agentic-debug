import * as vscode from 'vscode';
import { SessionManager } from 'ts-php-debug-mcp/session.js';
import { BreakpointLedger } from 'ts-php-debug-mcp/breakpoint-ledger.js';
import type { Config } from 'ts-php-debug-mcp/config.js';
import type { DebugBackend } from 'ts-php-debug-mcp/debug-backend.js';
import type { ToolResult } from 'ts-php-debug-mcp/tools/types.js';
import type { VsCodeNotificationSender } from './notification-sender.js';
import type { LaunchInput } from './types.js';
/**
 * Central infrastructure class for debug session lifecycle management.
 * Manages the singleton SessionManager, constructs Config by merging
 * tool params → VS Code settings → hardcoded defaults, creates backends,
 * and owns a BreakpointLedger per session.
 * (Requirements 6.1–6.7, 8.1, 8.3, 18.1–18.6)
 */
export declare class SessionFactory {
    private readonly notifier;
    private readonly outputChannel;
    session: SessionManager | null;
    backend: DebugBackend | null;
    breakpointLedger: BreakpointLedger | null;
    constructor(notifier: VsCodeNotificationSender, outputChannel: vscode.OutputChannel);
    /**
     * Launch a new debug session. Terminates any existing session first
     * (singleton invariant). Builds Config, resolves adapter path, creates
     * backend, PathMapper, BreakpointLedger, and SessionManager, then
     * delegates to handleDebugLaunch().
     */
    launch(params: LaunchInput): Promise<ToolResult>;
    /**
     * Terminate the active session and release all resources.
     * (Req 6.4)
     */
    terminate(): Promise<ToolResult>;
    /**
     * Build a complete Config by merging three tiers:
     * 1. Tool parameters (highest priority)
     * 2. VS Code workspace settings (agenticDebug.*)
     * 3. Hardcoded defaults (lowest priority)
     * (Req 18.1, 18.5)
     */
    buildConfig(params: LaunchInput): Config;
    /**
     * Locate the xdebug.php-debug extension's phpDebug.js adapter binary.
     * (Req 18.3, 18.4)
     */
    resolveDebugAdapterPath(): string;
}
