import * as vscode from 'vscode';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { DebugBackend, EventHandler } from 'ts-php-debug-mcp/debug-backend.js';

/**
 * Returns true if the given debug session is a PHP debug session.
 * No custom debug type or __agentInitiated marker — just match type 'php'.
 * (Requirement 6.2)
 */
export function isAgentSession(session: vscode.DebugSession): boolean {
  return session.type === 'php';
}

/**
 * DebugBackend that routes DAP operations through the VS Code debug API
 * using `type: 'php'` directly (no custom debug type).
 *
 * The developer sees the full native debug experience (gutter breakpoints,
 * pause line, variable panel, call stack) while the agent maintains
 * programmatic control via LM Tools.
 *
 * Event bridging: VS Code debug events are translated into
 * DebugProtocol.Event objects and dispatched to registered handlers,
 * so SessionManager works identically with either backend.
 * (Requirements 6.1–6.4)
 */
export class VsCodeDebugBackend implements DebugBackend {
  private session: vscode.DebugSession | null = null;
  private disposables: vscode.Disposable[] = [];
  private eventHandlers = new Map<string, EventHandler[]>();
  private anyEventHandlers: EventHandler[] = [];
  private alive = false;
  private seq = 1;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastKnownThreadCount = 0;
  private lastKnownState: 'none' | 'connected' | 'paused' = 'none';

  onTrace: ((direction: 'send' | 'recv', msg: DebugProtocol.ProtocolMessage) => void) | null = null;
  onStderr: ((text: string) => void) | null = null;

  constructor(private readonly workspaceFolder?: vscode.WorkspaceFolder) {}

  async initialize(): Promise<DebugProtocol.InitializeResponse> {
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((s) => this.handleSessionStart(s)),
      vscode.debug.onDidTerminateDebugSession((s) => this.handleSessionTerminate(s)),
      vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => this.handleCustomEvent(e)),
    );

    return this.syntheticResponse('initialize', {
      supportsConfigurationDoneRequest: true,
      supportsFunctionBreakpoints: true,
      supportsConditionalBreakpoints: true,
      supportsHitConditionalBreakpoints: true,
      supportsEvaluateForHovers: true,
      supportsSetVariable: true,
    }) as DebugProtocol.InitializeResponse;
  }

  async launch(config: DebugProtocol.LaunchRequestArguments): Promise<DebugProtocol.LaunchResponse> {
    // If an agent session is already running, attach to it (Requirement 15.11).
    if (this.session && this.alive) {
      this.startPolling();
      this.emitEvent('initialized', {});
      return this.syntheticResponse('launch') as DebugProtocol.LaunchResponse;
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
    this.startPolling();
    this.emitEvent('initialized', {});
    return this.syntheticResponse('launch') as DebugProtocol.LaunchResponse;
  }

  async configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse> {
    if (this.session) {
      try { await this.session.customRequest('configurationDone'); } catch { /* already done */ }
    }
    return this.syntheticResponse('configurationDone') as DebugProtocol.ConfigurationDoneResponse;
  }

  async sendRequest<T extends DebugProtocol.Response>(command: string, args?: object): Promise<T> {
    if (!this.session) throw new Error('No active debug session');

    const request: DebugProtocol.Request = {
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
    } as unknown as T;
    this.onTrace?.('recv', response);

    return response;
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    if (this.session) {
      await vscode.debug.stopDebugging(this.session);
    }
    this.alive = false;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  onEvent(eventName: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventName) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
  }

  onAnyEvent(handler: EventHandler): void {
    this.anyEventHandlers.push(handler);
  }

  waitForEvent(eventName: string, timeout = 30000): Promise<DebugProtocol.Event> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event "${eventName}" after ${timeout}ms`));
      }, timeout);

      const handler: EventHandler = (event) => {
        cleanup();
        resolve(event);
      };

      const cleanup = () => {
        clearTimeout(timer);
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
          const idx = handlers.indexOf(handler);
          if (idx !== -1) handlers.splice(idx, 1);
        }
      };

      this.onEvent(eventName, handler);
    });
  }

  isAlive(): boolean {
    return this.alive;
  }

  getStatus(): { alive: boolean; pid?: number; exitCode?: number; sessionId?: string } {
    return { alive: this.alive, sessionId: this.session?.id };
  }

  getSeq(): number {
    return this.seq;
  }

  // --- State polling ---
  // VS Code's debug API does not expose standard DAP events (stopped, thread,
  // continued) through onDidReceiveDebugSessionCustomEvent. We poll the session
  // to detect Xdebug connections and pause/resume transitions so that
  // SessionManager's state machine works correctly in UI mode.

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollSessionState(), 500);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollSessionState(): Promise<void> {
    if (!this.session || !this.alive) return;

    try {
      // Ask the adapter for threads — if we get any, Xdebug has connected
      const threadsResponse = await this.session.customRequest('threads');
      const threads: Array<{ id: number; name: string }> = threadsResponse?.threads ?? [];

      if (threads.length > 0 && this.lastKnownState === 'none') {
        // Xdebug just connected — emit thread event
        this.lastKnownThreadCount = threads.length;
        this.lastKnownState = 'connected';
        this.emitEvent('thread', { reason: 'started', threadId: threads[0].id });
      }

      if (threads.length > 0) {
        // Try to get stack trace for the first thread to detect paused state
        try {
          const stackResponse = await this.session.customRequest('stackTrace', {
            threadId: threads[0].id,
            startFrame: 0,
            levels: 1,
          });
          const frames = stackResponse?.stackFrames ?? [];

          if (frames.length > 0 && this.lastKnownState !== 'paused') {
            // We have a stack — execution is paused
            this.lastKnownState = 'paused';
            this.emitEvent('stopped', {
              reason: 'breakpoint',
              threadId: threads[0].id,
              allThreadsStopped: true,
            });
          } else if (frames.length === 0 && this.lastKnownState === 'paused') {
            // No stack — execution resumed
            this.lastKnownState = 'connected';
            this.emitEvent('continued', { threadId: threads[0].id, allThreadsContinued: true });
          }
        } catch {
          // stackTrace fails when running (not paused) — that's expected
          if (this.lastKnownState === 'paused') {
            this.lastKnownState = 'connected';
            this.emitEvent('continued', { threadId: threads[0].id, allThreadsContinued: true });
          }
        }
      }

      if (threads.length === 0 && this.lastKnownThreadCount > 0) {
        // Xdebug disconnected
        this.lastKnownThreadCount = 0;
        this.lastKnownState = 'none';
      }
    } catch {
      // Session might be gone — stop polling
    }
  }

  // --- Private helpers ---

  /**
   * Build a debug configuration with type 'php' directly.
   * No custom debug type, no __agentInitiated marker.
   * (Requirement 6.1)
   */
  private buildDebugConfig(config: DebugProtocol.LaunchRequestArguments): vscode.DebugConfiguration {
    return {
      type: 'php',
      name: 'Agentic Debug Session',
      request: 'launch',
      ...(config as Record<string, unknown>),
    };
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
          this.alive = true;
          resolve();
        }
      });
    });
  }

  private syntheticResponse(command: string, body?: object): DebugProtocol.Response {
    return {
      seq: this.seq++,
      type: 'response',
      request_seq: 0,
      command,
      success: true,
      ...(body ? { body } : {}),
    } as DebugProtocol.Response;
  }

  // --- Event bridge ---

  /** Handle session start — track the session if it's a PHP session. */
  private handleSessionStart(session: vscode.DebugSession): void {
    if (session.type !== 'php') return;

    if (!this.session) {
      this.session = session;
      this.alive = true;
      this.startPolling();
      this.emitEvent('initialized', {});
    }
  }

  /** Handle session terminate — clean up if it's our tracked session. */
  private handleSessionTerminate(session: vscode.DebugSession): void {
    if (session !== this.session) return;
    this.stopPolling();
    this.alive = false;
    this.lastKnownState = 'none';
    this.lastKnownThreadCount = 0;
    this.emitEvent('terminated', {});
    this.session = null;
  }

  /** Requirement 15.9: translate custom events to DebugProtocol.Event. */
  private handleCustomEvent(e: vscode.DebugSessionCustomEvent): void {
    if (e.session !== this.session) return;
    this.emitEvent(e.event, e.body ?? {});
  }

  private emitEvent(eventName: string, body: object): void {
    const event: DebugProtocol.Event = {
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
