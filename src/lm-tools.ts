import * as vscode from 'vscode';
import type { DebugSessionManager } from './debug-session-manager.js';

// --- Types ---

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: { message: string; code: string };
}

function ok(data: unknown): ToolResult {
  return { success: true, data };
}

function err(message: string, code = 'DAP_ERROR'): ToolResult {
  return { success: false, error: { message, code } };
}

function wrap(result: ToolResult): vscode.LanguageModelToolResult {
  const payload = result.success ? result.data : result.error;
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2)),
  ]);
}

function noSession(): ToolResult {
  return err('No active debug session. Call debug_launch first.', 'SESSION_NOT_STARTED');
}

// --- Input types ---

interface LaunchInput {
  port?: number;
  pathMappings?: Record<string, string>;
  stopOnEntry?: boolean;
  hostname?: string;
  log?: boolean;
}

interface ThreadIdInput { threadId?: number; }
interface ScopesInput { frameId: number; }
interface VariablesInput { variablesReference: number; start?: number; count?: number; }
interface EvaluateInput { expression: string; frameId?: number; context?: string; }
interface BreakpointsInput {
  path: string;
  breakpoints: Array<{ line: number; condition?: string; hitCondition?: string; logMessage?: string }>;
}

// --- Helper: resolve threadId from input or last stopped thread ---

function resolveThreadId(mgr: DebugSessionManager, input: ThreadIdInput): number | ToolResult {
  if (input.threadId !== undefined) return input.threadId;
  if (mgr.stopInfo) return mgr.stopInfo.threadId;
  return err('threadId is required — no stopped thread available', 'INVALID_PARAMS');
}

// --- Launch ---

class DebugLaunchTool implements vscode.LanguageModelTool<LaunchInput> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<LaunchInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const port = options.input.port ?? 'default';
    return {
      confirmationMessages: {
        title: 'Launch Debug Session',
        message: new vscode.MarkdownString(`Start PHP debug session on port **${port}**?`),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LaunchInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      await this.mgr.launch(options.input);
      return wrap(ok({
        status: this.mgr.state,
        message: `Debug session launched, listening on port ${options.input.port ?? 9003}`,
      }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Terminate ---

class DebugTerminateTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      confirmationMessages: {
        title: 'Terminate Debug Session',
        message: new vscode.MarkdownString('End the current debug session?'),
      },
    };
  }

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    try {
      await this.mgr.terminate();
      return wrap(ok({ status: 'terminated', message: 'Debug session terminated' }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Simple DAP command tool (continue, next, stepIn, stepOut, pause) ---

function makeStepTool(command: string, label: string) {
  return class implements vscode.LanguageModelTool<ThreadIdInput> {
    constructor(private readonly mgr: DebugSessionManager) {}

    prepareInvocation(
      options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
      return { invocationMessage: `${label} on thread ${options.input.threadId ?? 'default'}` };
    }

    async invoke(
      options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    ): Promise<vscode.LanguageModelToolResult> {
      if (!this.mgr.activeSession) return wrap(noSession());
      const tid = resolveThreadId(this.mgr, options.input);
      if (typeof tid !== 'number') return wrap(tid);
      try {
        await this.mgr.customRequest(command, { threadId: tid });
        return wrap(ok({ threadId: tid, message: `${label} on thread ${tid}` }));
      } catch (e: unknown) {
        return wrap(err(e instanceof Error ? e.message : String(e)));
      }
    }
  };
}

const DebugContinueTool = makeStepTool('continue', 'Continued execution');
const DebugNextTool = makeStepTool('next', 'Stepped over');
const DebugStepInTool = makeStepTool('stepIn', 'Stepped into');
const DebugStepOutTool = makeStepTool('stepOut', 'Stepped out');
const DebugPauseTool = makeStepTool('pause', 'Paused execution');

// --- Stack Trace ---

class DebugStackTraceTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Retrieving stack trace' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.mgr.activeSession) return wrap(noSession());
    const tid = resolveThreadId(this.mgr, options.input);
    if (typeof tid !== 'number') return wrap(tid);
    try {
      const body = await this.mgr.customRequest('stackTrace', { threadId: tid });
      const frames = (body?.stackFrames ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        source: f.source ? { name: f.source.name, path: f.source.path, sourceReference: f.source.sourceReference } : undefined,
        line: f.line,
        column: f.column,
      }));
      return wrap(ok({ stackFrames: frames, totalFrames: body?.totalFrames }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Scopes ---

class DebugScopesTool implements vscode.LanguageModelTool<ScopesInput> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ScopesInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Retrieving scopes for frame ${options.input.frameId}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ScopesInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const body = await this.mgr.customRequest('scopes', { frameId: options.input.frameId });
      const scopes = (body?.scopes ?? []).map((s: any) => ({
        name: s.name,
        variablesReference: s.variablesReference,
        namedVariables: s.namedVariables,
        indexedVariables: s.indexedVariables,
        expensive: s.expensive,
      }));
      return wrap(ok({ scopes }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Variables ---

class DebugVariablesTool implements vscode.LanguageModelTool<VariablesInput> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<VariablesInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Retrieving variables for ref ${options.input.variablesReference}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<VariablesInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const args: Record<string, unknown> = { variablesReference: options.input.variablesReference };
      if (options.input.start !== undefined) args.start = options.input.start;
      if (options.input.count !== undefined) args.count = options.input.count;
      const body = await this.mgr.customRequest('variables', args);
      const variables = (body?.variables ?? []).map((v: any) => ({
        name: v.name,
        value: v.value,
        type: v.type,
        variablesReference: v.variablesReference ?? 0,
        indexedVariables: v.indexedVariables,
        namedVariables: v.namedVariables,
      }));
      return wrap(ok({ variables }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Evaluate ---

class DebugEvaluateTool implements vscode.LanguageModelTool<EvaluateInput> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<EvaluateInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Evaluating: ${options.input.expression}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<EvaluateInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const args: Record<string, unknown> = {
        expression: options.input.expression,
        context: options.input.context ?? 'repl',
      };
      if (options.input.frameId !== undefined) args.frameId = options.input.frameId;
      const body = await this.mgr.customRequest('evaluate', args);
      return wrap(ok({
        result: body?.result,
        type: body?.type,
        variablesReference: body?.variablesReference ?? 0,
        indexedVariables: body?.indexedVariables,
        namedVariables: body?.namedVariables,
      }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Status ---

class DebugStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Checking debug session status' };
  }

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    const guidance: Record<string, string> = {
      not_started: 'No active session. Call debug_launch to start debugging.',
      launching: 'Session is starting. Wait a moment and check again.',
      listening: 'Listening for Xdebug connections. Trigger your PHP script now.',
      connected: 'Xdebug connected, execution running. Set breakpoints or call debug_pause.',
      paused: 'Execution paused. Inspect with debug_stack_trace, debug_variables, debug_evaluate. Step with debug_next/debug_step_in/debug_step_out. Resume with debug_continue.',
      terminated: 'Session ended. Call debug_launch to start a new session.',
    };
    return wrap(ok({
      state: this.mgr.state,
      stopInfo: this.mgr.stopInfo,
      guidance: guidance[this.mgr.state] ?? 'Unknown state.',
    }));
  }
}

// --- Threads ---

class DebugThreadsTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Listing debug threads' };
  }

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const body = await this.mgr.customRequest('threads');
      const threads = (body?.threads ?? []).map((t: any) => ({ id: t.id, name: t.name }));
      return wrap(ok({ threads }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Set Breakpoints ---

class DebugBreakpointsTool implements vscode.LanguageModelTool<BreakpointsInput> {
  constructor(private readonly mgr: DebugSessionManager) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<BreakpointsInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Setting ${options.input.breakpoints.length} breakpoint(s) in ${options.input.path}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BreakpointsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      // Pass the local path directly — xdebug.php-debug handles
      // path mapping via its own pathMappings config
      const body = await this.mgr.customRequest('setBreakpoints', {
        source: { path: options.input.path },
        breakpoints: options.input.breakpoints.map((bp) => ({
          line: bp.line,
          ...(bp.condition !== undefined ? { condition: bp.condition } : {}),
          ...(bp.hitCondition !== undefined ? { hitCondition: bp.hitCondition } : {}),
          ...(bp.logMessage !== undefined ? { logMessage: bp.logMessage } : {}),
        })),
      });
      const breakpoints = (body?.breakpoints ?? []).map((bp: any) => ({
        verified: bp.verified,
        line: bp.line,
        id: bp.id,
        message: bp.message,
      }));
      return wrap(ok({
        path: options.input.path,
        breakpoints,
        message: `Set ${breakpoints.length} breakpoint(s) in ${options.input.path}`,
      }));
    } catch (e: unknown) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
}

// --- Register all tools ---

export function registerAllLmTools(
  context: vscode.ExtensionContext,
  mgr: DebugSessionManager,
): void {
  const tools: Array<[string, vscode.LanguageModelTool<any>]> = [
    ['debug_launch', new DebugLaunchTool(mgr)],
    ['debug_terminate', new DebugTerminateTool(mgr)],
    ['debug_status', new DebugStatusTool(mgr)],
    ['debug_continue', new DebugContinueTool(mgr)],
    ['debug_next', new DebugNextTool(mgr)],
    ['debug_step_in', new DebugStepInTool(mgr)],
    ['debug_step_out', new DebugStepOutTool(mgr)],
    ['debug_pause', new DebugPauseTool(mgr)],
    ['debug_stack_trace', new DebugStackTraceTool(mgr)],
    ['debug_scopes', new DebugScopesTool(mgr)],
    ['debug_variables', new DebugVariablesTool(mgr)],
    ['debug_evaluate', new DebugEvaluateTool(mgr)],
    ['debug_threads', new DebugThreadsTool(mgr)],
    ['debug_breakpoints', new DebugBreakpointsTool(mgr)],
  ];

  for (const [name, tool] of tools) {
    context.subscriptions.push(vscode.lm.registerTool(name, tool));
  }
}
