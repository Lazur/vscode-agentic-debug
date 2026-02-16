import * as vscode from 'vscode';
import * as path from 'node:path';
import { SessionManager } from 'ts-php-debug-mcp/session.js';
import { DAPClient } from 'ts-php-debug-mcp/dap-client.js';
import { PathMapper } from 'ts-php-debug-mcp/path-mapper.js';
import { BreakpointLedger } from 'ts-php-debug-mcp/breakpoint-ledger.js';
import { handleDebugLaunch } from 'ts-php-debug-mcp/tools/debug-launch.js';
import { handleDebugTerminate } from 'ts-php-debug-mcp/tools/debug-terminate.js';
import type { Config } from 'ts-php-debug-mcp/config.js';
import type { DebugBackend } from 'ts-php-debug-mcp/debug-backend.js';
import type { ToolResult } from 'ts-php-debug-mcp/tools/types.js';
import { VsCodeDebugBackend } from './vscode-debug-backend.js';
import type { VsCodeNotificationSender } from './notification-sender.js';
import type { LaunchInput } from './types.js';

/**
 * Central infrastructure class for debug session lifecycle management.
 * Manages the singleton SessionManager, constructs Config by merging
 * tool params → VS Code settings → hardcoded defaults, creates backends,
 * and owns a BreakpointLedger per session.
 * (Requirements 6.1–6.7, 8.1, 8.3, 18.1–18.6)
 */
export class SessionFactory {
  session: SessionManager | null = null;
  backend: DebugBackend | null = null;
  breakpointLedger: BreakpointLedger | null = null;

  constructor(
    private readonly notifier: VsCodeNotificationSender,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  /**
   * Launch a new debug session. Terminates any existing session first
   * (singleton invariant). Builds Config, resolves adapter path, creates
   * backend, PathMapper, BreakpointLedger, and SessionManager, then
   * delegates to handleDebugLaunch().
   */
  async launch(params: LaunchInput): Promise<ToolResult> {
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
      ? new DAPClient(adapterPath)
      : new VsCodeDebugBackend();

    // 4. Create PathMapper from pathMappings (Record<server, local> → PathMapping[])
    const pathMapper = new PathMapper(
      Object.entries(config.pathMappings).map(([remote, local]) => ({ remote, local })),
    );

    // 5. Create BreakpointLedger for this session (Req 18.6)
    this.breakpointLedger = new BreakpointLedger(this.backend, pathMapper);

    // 6. Create SessionManager (Req 6.1, 6.2)
    this.session = new SessionManager(config, this.backend, pathMapper, this.notifier);

    // 7. Delegate to handleDebugLaunch (Req 6.3)
    return await handleDebugLaunch(this.session, params);
  }

  /**
   * Terminate the active session and release all resources.
   * (Req 6.4)
   */
  async terminate(): Promise<ToolResult> {
    if (!this.session) {
      return {
        success: false,
        error: { message: 'No active session', code: 'SESSION_NOT_STARTED' },
      };
    }
    const result = await handleDebugTerminate(this.session);
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
  buildConfig(params: LaunchInput): Config {
    const settings = vscode.workspace.getConfiguration('agenticDebug');
    const adapterPath = this.resolveDebugAdapterPath();

    return {
      adapterPath,
      port: params.port ?? settings.get<number>('port') ?? 9003,
      hostname: settings.get<string>('hostname') ?? '127.0.0.1',
      stopOnEntry: params.stopOnEntry ?? settings.get<boolean>('stopOnEntry') ?? true,
      pathMappings: params.pathMappings ?? settings.get<Record<string, string>>('pathMappings') ?? {},
      maxConnections: settings.get<number>('maxConnections') ?? 0,
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
  resolveDebugAdapterPath(): string {
    const ext = vscode.extensions.getExtension('xdebug.php-debug');
    if (!ext) {
      throw new Error(
        'xdebug.php-debug extension is required but not installed. ' +
        'Please install it from the VS Code marketplace.',
      );
    }
    return path.join(ext.extensionPath, 'out', 'phpDebug.js');
  }
}
