import * as vscode from 'vscode';

/**
 * Lightweight wrapper around a VS Code debug session.
 * Tracks session state by listening to VS Code debug events and
 * proxies DAP requests via session.customRequest().
 *
 * No custom debug type, no config provider, no adapter — just
 * reuses xdebug.php-debug natively.
 */

export type SessionState =
  | 'not_started'
  | 'launching'
  | 'listening'
  | 'connected'
  | 'paused'
  | 'terminated';

export interface StopInfo {
  reason: string;
  threadId: number;
  description?: string;
  allThreadsStopped?: boolean;
}

export class DebugSessionManager {
  private session: vscode.DebugSession | null = null;
  private disposables: vscode.Disposable[] = [];
  private _state: SessionState = 'not_started';
  private _stopInfo: StopInfo | undefined;

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  get state(): SessionState { return this._state; }
  get stopInfo(): StopInfo | undefined { return this._stopInfo; }
  get activeSession(): vscode.DebugSession | null { return this.session; }

  /**
   * Start a new debug session by calling vscode.debug.startDebugging
   * with type: "php". xdebug.php-debug handles everything — config,
   * pathMappings, adapter lifecycle.
   */
  async launch(params: {
      port?: number;
      pathMappings?: Record<string, string>;
      stopOnEntry?: boolean;
      hostname?: string;
      log?: boolean;
    }): Promise<void> {
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
      const nonEmpty = (m: Record<string, string> | undefined | null): Record<string, string> | undefined =>
        m && Object.keys(m).length > 0 ? m : undefined;
      const resolvedPathMappings =
        nonEmpty(params.pathMappings)
        ?? nonEmpty(settings.get<Record<string, string>>('pathMappings'))
        ?? this.getPathMappingsFromLaunchJson()
        ?? {};

      const config: vscode.DebugConfiguration = {
        type: 'php',
        name: 'Agentic Debug Session',
        request: 'launch',
        port: params.port ?? settings.get<number>('port') ?? 9003,
        hostname: params.hostname ?? settings.get<string>('hostname') ?? '127.0.0.1',
        stopOnEntry: params.stopOnEntry ?? settings.get<boolean>('stopOnEntry') ?? true,
        pathMappings: resolvedPathMappings,
        maxConnections: settings.get<number>('maxConnections') ?? 0,
        log: params.log ?? false,
      };

      this.outputChannel.appendLine(
        `[launch] Starting debug session with config: ${JSON.stringify(config)}`,
      );

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
  async terminate(): Promise<void> {
    if (this.session) {
      await vscode.debug.stopDebugging(this.session);
    }
    this.cleanup();
  }

  /** Send a DAP request through the active session. */
  async customRequest(command: string, args?: object): Promise<any> {
    if (!this.session) {
      throw new Error('No active debug session');
    }
    return this.session.customRequest(command, args);
  }


  // --- Private helpers ---

  private setState(state: SessionState): void {
    const old = this._state;
    this._state = state;
    this.outputChannel.appendLine(`[state] ${old} → ${state}`);
  }
  /**
   * Scan workspace launch.json for a PHP debug config that has pathMappings.
   * Returns the first non-empty pathMappings found, or undefined.
   */
  private getPathMappingsFromLaunchJson(): Record<string, string> | undefined {
    const launchConfig = vscode.workspace.getConfiguration('launch');
    const configurations = launchConfig.get<vscode.DebugConfiguration[]>('configurations');
    if (!configurations) return undefined;

    for (const cfg of configurations) {
      if (cfg.type === 'php' && cfg.pathMappings && Object.keys(cfg.pathMappings).length > 0) {
        this.outputChannel.appendLine(
          `[launch] Using pathMappings from launch.json config "${cfg.name}": ${JSON.stringify(cfg.pathMappings)}`,
        );
        return cfg.pathMappings as Record<string, string>;
      }
    }
    return undefined;
  }



  private registerEventListeners(): void {
    // Clean up any previous listeners
    this.disposeListeners();

    this.disposables.push(
      vscode.debug.onDidStartDebugSession((s) => {
        if (s === this.session || (s.type === 'php' && !this.session)) {
          this.session = s;
          this.outputChannel.appendLine(
            `[session] Started: ${s.name} (id=${s.id})`,
          );
          this.outputChannel.appendLine(
            `[session] Config: ${JSON.stringify(s.configuration)}`,
          );
        }
      }),

      vscode.debug.onDidTerminateDebugSession((s) => {
        if (s === this.session) {
          this.outputChannel.appendLine(`[session] Terminated: ${s.name}`);
          this.setState('terminated');
          this.session = null;
          this._stopInfo = undefined;
        }
      }),

      vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
        if (e.session !== this.session) return;

        if (e.event === 'stopped') {
          this._stopInfo = {
            reason: e.body?.reason ?? 'unknown',
            threadId: e.body?.threadId ?? 0,
            description: e.body?.description,
            allThreadsStopped: e.body?.allThreadsStopped,
          };
          this.setState('paused');
          this.outputChannel.appendLine(
            `[event] stopped: ${this._stopInfo.reason} (thread ${this._stopInfo.threadId})`,
          );
        } else if (e.event === 'continued') {
          this._stopInfo = undefined;
          this.setState('connected');
        } else if (e.event === 'thread') {
          if (this._state === 'listening') {
            this.setState('connected');
          }
          this.outputChannel.appendLine(
            `[event] thread: ${e.body?.reason} (id=${e.body?.threadId})`,
          );
        }
      }),
    );
  }

  private awaitSessionStart(timeoutMs = 30000): Promise<void> {
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

  private disposeListeners(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private cleanup(): void {
    this.disposeListeners();
    this.session = null;
    this._state = 'not_started';
    this._stopInfo = undefined;
  }

  dispose(): void {
    this.cleanup();
  }
}
