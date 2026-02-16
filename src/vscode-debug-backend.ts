import * as vscode from 'vscode';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { DebugBackend, EventHandler } from 'ts-php-debug-mcp/debug-backend.js';
import type { AgentSessionEntry } from './types.js';

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
export function isAgentSession(session: vscode.DebugSession): boolean {
  return session.type === 'php' &&
    (session.configuration as Record<string, unknown>).__agentInitiated === true;
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
export class VsCodeDebugBackend implements DebugBackend {
  private session: vscode.DebugSession | null = null;
  private disposables: vscode.Disposable[] = [];
  private eventHandlers = new Map<string, EventHandler[]>();
  private anyEventHandlers: EventHandler[] = [];
  private alive = false;
  private seq = 1;

  /** Agent session tracking Map keyed by vscode.DebugSession.id (Requirement 15.5). */
  private agentSessions = new Map<string, AgentSessionEntry>();

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

  /** Expose tracked agent sessions for testing/inspection. */
  getAgentSessions(): ReadonlyMap<string, AgentSessionEntry> {
    return this.agentSessions;
  }

  // --- Private helpers ---

  /**
   * Build a debug configuration with type 'php-agent' and __agentInitiated marker.
   * The DebugConfigurationProvider will transform php-agent → php at launch time.
   * (Requirement 15.3)
   */
  private buildDebugConfig(config: DebugProtocol.LaunchRequestArguments): vscode.DebugConfiguration {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
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

  private awaitSessionStart(timeoutMs = 30000): Promise<void> {
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

  /** Requirement 15.6: store agent session context on start. */
  private handleSessionStart(session: vscode.DebugSession): void {
    if (!isAgentSession(session)) return;

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
  private handleSessionTerminate(session: vscode.DebugSession): void {
    this.agentSessions.delete(session.id);

    if (session !== this.session) return;
    this.alive = false;
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
