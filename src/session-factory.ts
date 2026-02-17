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
    this.outputChannel.appendLine(`[launch] === debug_launch invoked ===`);
    this.outputChannel.appendLine(`[launch] Raw params: ${JSON.stringify(params)}`);

    // Singleton invariant: terminate existing session if active (Req 6.5)
    if (this.session) {
      this.outputChannel.appendLine(`[launch] Existing session found — terminating before re-launch`);
      await this.terminate();
    }

    // 1. Build Config by merging: tool params → VS Code settings → defaults
    const config = this.buildConfig(params);
    this.outputChannel.appendLine(`[launch] Final resolved config: ${JSON.stringify(config, null, 2)}`);

    // 3. Create backend — always UI mode for now; headless has limited
    //    thread/variable support and is not ready for interactive use.
    const requestedMode = params.backendMode ?? 'ui';
    if (requestedMode === 'headless') {
      this.outputChannel.appendLine(`[launch] ⚠ backendMode "headless" requested but forced to "ui" — headless is not reliable for interactive debugging`);
    }
    this.backend = new VsCodeDebugBackend();

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
  /**
     * Build a complete Config by merging three tiers:
     * 1. Tool parameters (highest priority)
     * 2. VS Code workspace settings (agenticDebug.*)
     * 3. launch.json PHP config pathMappings (for pathMappings only)
     * 4. Hardcoded defaults (lowest priority)
     * (Req 18.1, 18.5, 4.1–4.4)
     */
    buildConfig(params: LaunchInput): Config {
      const settings = vscode.workspace.getConfiguration('agenticDebug');
      const adapterPath = this.resolveDebugAdapterPath();

      // Agents sometimes wrap params inside a "configuration" object — unwrap it
      // so that pathMappings, port, stopOnEntry etc. are found at the top level.
      const raw = params as Record<string, unknown>;
      if (raw.configuration && typeof raw.configuration === 'object') {
        const nested = raw.configuration as Record<string, unknown>;
        this.outputChannel.appendLine(`[config] Detected nested "configuration" object — unwrapping fields`);
        if (nested.pathMappings !== undefined && params.pathMappings === undefined) {
          (params as Record<string, unknown>).pathMappings = nested.pathMappings;
        }
        if (nested.port !== undefined && params.port === undefined) {
          (params as Record<string, unknown>).port = nested.port;
        }
        if (nested.stopOnEntry !== undefined && params.stopOnEntry === undefined) {
          (params as Record<string, unknown>).stopOnEntry = nested.stopOnEntry;
        }
        if (nested.hostname !== undefined && params.hostname === undefined) {
          (params as Record<string, unknown>).hostname = nested.hostname;
        }
        if (nested.log !== undefined && params.log === undefined) {
          (params as Record<string, unknown>).log = nested.log;
        }
        this.outputChannel.appendLine(`[config] Params after unwrap: ${JSON.stringify(params)}`);
      }

      // nonEmpty treats {} the same as undefined so the fallback chain works
      // when the agent sends pathMappings: {} meaning "use defaults" (Req 4.1)
      const nonEmpty = (m: Record<string, string> | undefined | null): Record<string, string> | undefined =>
        m && Object.keys(m).length > 0 ? m : undefined;

      // --- pathMappings resolution with detailed logging ---
      const paramMappings = params.pathMappings;
      const settingsMappings = settings.get<Record<string, string>>('pathMappings');

      this.outputChannel.appendLine(`[config] pathMappings resolution chain:`);
      this.outputChannel.appendLine(`[config]   1. Tool params.pathMappings = ${JSON.stringify(paramMappings)} (keys: ${paramMappings ? Object.keys(paramMappings).length : 'n/a'})`);
      this.outputChannel.appendLine(`[config]      nonEmpty(params) → ${JSON.stringify(nonEmpty(paramMappings))}`);
      this.outputChannel.appendLine(`[config]   2. VS Code setting agenticDebug.pathMappings = ${JSON.stringify(settingsMappings)} (keys: ${settingsMappings ? Object.keys(settingsMappings).length : 'n/a'})`);
      this.outputChannel.appendLine(`[config]      nonEmpty(settings) → ${JSON.stringify(nonEmpty(settingsMappings))}`);

      let resolvedPathMappings: Record<string, string>;
      let resolvedFrom: string;

      const fromParams = nonEmpty(paramMappings);
      if (fromParams) {
        resolvedPathMappings = fromParams;
        resolvedFrom = 'tool params';
      } else {
        const fromSettings = nonEmpty(settingsMappings);
        if (fromSettings) {
          resolvedPathMappings = fromSettings;
          resolvedFrom = 'VS Code settings (agenticDebug.pathMappings)';
        } else {
          const fromLaunchJson = this.getPathMappingsFromLaunchJson();
          this.outputChannel.appendLine(`[config]   3. launch.json fallback → ${JSON.stringify(fromLaunchJson)}`);
          if (fromLaunchJson) {
            resolvedPathMappings = fromLaunchJson;
            resolvedFrom = 'launch.json';
          } else {
            resolvedPathMappings = {};
            resolvedFrom = 'default empty {}';
          }
        }
      }

      this.outputChannel.appendLine(`[config]   ✓ Resolved pathMappings from: ${resolvedFrom}`);
      this.outputChannel.appendLine(`[config]   ✓ Final pathMappings: ${JSON.stringify(resolvedPathMappings)}`);

      if (Object.keys(resolvedPathMappings).length === 0) {
        this.outputChannel.appendLine(`[config]   ⚠ WARNING: pathMappings is EMPTY — remote paths will NOT be mapped to local files. If debugging a Docker/remote setup, breakpoints and stack traces will likely fail.`);
      }

      const resolvedPort = params.port ?? settings.get<number>('port') ?? 9003;
      const resolvedHostname = params.hostname ?? settings.get<string>('hostname') ?? '127.0.0.1';
      const resolvedStopOnEntry = params.stopOnEntry ?? settings.get<boolean>('stopOnEntry') ?? true;
      const resolvedLog = params.log ?? false;

      this.outputChannel.appendLine(`[config] Other resolved values: port=${resolvedPort}, hostname=${resolvedHostname}, stopOnEntry=${resolvedStopOnEntry}, log=${resolvedLog}`);

      return {
        adapterPath,
        port: resolvedPort,
        hostname: resolvedHostname,
        stopOnEntry: resolvedStopOnEntry,
        pathMappings: resolvedPathMappings,
        maxConnections: settings.get<number>('maxConnections') ?? 0,
        runtimeExecutable: 'php',
        log: resolvedLog,
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

  /**
   * Scan workspace launch.json for a PHP debug config that has pathMappings.
   * Returns the first non-empty pathMappings found, or undefined.
   * (Req 4.3)
   */
  private getPathMappingsFromLaunchJson(): Record<string, string> | undefined {
    const launchConfig = vscode.workspace.getConfiguration('launch');
    const configurations = launchConfig.get<vscode.DebugConfiguration[]>('configurations');
    if (!configurations) {
      this.outputChannel.appendLine(`[config]      launch.json: no 'configurations' found in workspace`);
      return undefined;
    }

    this.outputChannel.appendLine(`[config]      launch.json: found ${configurations.length} configuration(s)`);
    for (const cfg of configurations) {
      const hasPathMappings = cfg.pathMappings && Object.keys(cfg.pathMappings).length > 0;
      this.outputChannel.appendLine(`[config]        - "${cfg.name}" type=${cfg.type} pathMappings=${JSON.stringify(cfg.pathMappings)} (usable: ${cfg.type === 'php' && hasPathMappings})`);
      if (cfg.type === 'php' && hasPathMappings) {
        this.outputChannel.appendLine(
          `[config]      ✓ Using pathMappings from launch.json config "${cfg.name}": ${JSON.stringify(cfg.pathMappings)}`,
        );
        return cfg.pathMappings as Record<string, string>;
      }
    }
    this.outputChannel.appendLine(`[config]      launch.json: no PHP config with non-empty pathMappings found`);
    return undefined;
  }
}
