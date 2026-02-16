import * as vscode from 'vscode';
import { handleDebugContinue } from 'ts-php-debug-mcp/tools/debug-continue.js';
import { handleDebugNext } from 'ts-php-debug-mcp/tools/debug-next.js';
import { handleDebugStepIn } from 'ts-php-debug-mcp/tools/debug-step-in.js';
import { handleDebugStepOut } from 'ts-php-debug-mcp/tools/debug-step-out.js';
import { handleDebugPause } from 'ts-php-debug-mcp/tools/debug-pause.js';
import { handleDebugStackTrace } from 'ts-php-debug-mcp/tools/debug-stack-trace.js';
import { handleDebugScopes } from 'ts-php-debug-mcp/tools/debug-scopes.js';
import { handleDebugVariables } from 'ts-php-debug-mcp/tools/debug-variables.js';
import { handleDebugEvaluate } from 'ts-php-debug-mcp/tools/debug-evaluate.js';
import { handleDebugStatus } from 'ts-php-debug-mcp/tools/debug-status.js';
import { handleDebugThreads } from 'ts-php-debug-mcp/tools/debug-threads.js';
import { handleDebugSetBreakpoints } from 'ts-php-debug-mcp/tools/debug-set-breakpoints.js';
import { errorResult, type ToolResult } from 'ts-php-debug-mcp/tools/types.js';
import { wrapToolResult } from './result-wrapper.js';
import type { SessionFactory } from './session-factory.js';
import type {
  LaunchInput,
  ThreadIdInput,
  ScopesInput,
  VariablesInput,
  EvaluateInput,
  BreakpointsInput,
  BreakpointsGetInput,
} from './types.js';

// --- Helper ---

function noSessionError(): ToolResult {
  return errorResult('No active debug session. Call debug_launch first.', 'SESSION_NOT_STARTED');
}

function noThreadIdError(): ToolResult {
  return errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS');
}

// --- 5.1: DebugLaunchTool (Requirements 3.1, 3.4, 3.5, 4.1, 5.1-5.5) ---

export class DebugLaunchTool implements vscode.LanguageModelTool<LaunchInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<LaunchInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const mode = options.input.backendMode ?? 'ui';
    const port = options.input.port ?? 'default';
    return {
      confirmationMessages: {
        title: 'Launch Debug Session',
        message: new vscode.MarkdownString(
          `Start **${mode}** debug session on port **${port}**?`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LaunchInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const result = await this.sessionFactory.launch(options.input);
    return wrapToolResult(result);
  }
}

// --- 5.2: DebugTerminateTool (Requirements 3.1, 3.4, 3.5, 4.2) ---

export class DebugTerminateTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      confirmationMessages: {
        title: 'Terminate Debug Session',
        message: new vscode.MarkdownString('End the current debug session?'),
      },
    };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const result = await this.sessionFactory.terminate();
    return wrapToolResult(result);
  }
}

// --- 5.3: Stepping tools (Requirements 3.1, 3.4, 4.3, 10.1-10.6) ---

/** Resolve threadId from input or session.stopInfo, returning an error ToolResult if neither available. */
function resolveThreadId(
  sessionFactory: SessionFactory,
  input: ThreadIdInput,
): { threadId: number } | { error: ToolResult } {
  if (input.threadId !== undefined) return { threadId: input.threadId };
  const stopInfo = sessionFactory.session?.stopInfo;
  if (stopInfo) return { threadId: stopInfo.threadId };
  return { error: noThreadIdError() };
}

export class DebugContinueTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Continuing execution on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const resolved = resolveThreadId(this.sessionFactory, options.input);
    if ('error' in resolved) return wrapToolResult(resolved.error);
    const result = await handleDebugContinue(this.sessionFactory.session, { threadId: resolved.threadId });
    return wrapToolResult(result);
  }
}

export class DebugNextTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Stepping over on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const resolved = resolveThreadId(this.sessionFactory, options.input);
    if ('error' in resolved) return wrapToolResult(resolved.error);
    const result = await handleDebugNext(this.sessionFactory.session, { threadId: resolved.threadId });
    return wrapToolResult(result);
  }
}

export class DebugStepInTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Stepping into on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const resolved = resolveThreadId(this.sessionFactory, options.input);
    if ('error' in resolved) return wrapToolResult(resolved.error);
    const result = await handleDebugStepIn(this.sessionFactory.session, { threadId: resolved.threadId });
    return wrapToolResult(result);
  }
}

export class DebugStepOutTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Stepping out on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const resolved = resolveThreadId(this.sessionFactory, options.input);
    if ('error' in resolved) return wrapToolResult(resolved.error);
    const result = await handleDebugStepOut(this.sessionFactory.session, { threadId: resolved.threadId });
    return wrapToolResult(result);
  }
}

export class DebugPauseTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Pausing execution on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const resolved = resolveThreadId(this.sessionFactory, options.input);
    if ('error' in resolved) return wrapToolResult(resolved.error);
    const result = await handleDebugPause(this.sessionFactory.session, { threadId: resolved.threadId });
    return wrapToolResult(result);
  }
}

// --- 5.4: Inspection tools (Requirements 3.1, 3.4, 4.4, 11.1-11.5) ---

export class DebugStackTraceTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Retrieving stack trace' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const resolved = resolveThreadId(this.sessionFactory, options.input);
    if ('error' in resolved) return wrapToolResult(resolved.error);
    const result = await handleDebugStackTrace(this.sessionFactory.session, { threadId: resolved.threadId });
    return wrapToolResult(result);
  }
}

export class DebugScopesTool implements vscode.LanguageModelTool<ScopesInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ScopesInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Retrieving scopes for frame ${options.input.frameId}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ScopesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const result = await handleDebugScopes(this.sessionFactory.session, options.input);
    return wrapToolResult(result);
  }
}

export class DebugVariablesTool implements vscode.LanguageModelTool<VariablesInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<VariablesInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Retrieving variables for reference ${options.input.variablesReference}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<VariablesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const result = await handleDebugVariables(this.sessionFactory.session, options.input);
    return wrapToolResult(result);
  }
}

export class DebugEvaluateTool implements vscode.LanguageModelTool<EvaluateInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<EvaluateInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Evaluating: ${options.input.expression}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<EvaluateInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const result = await handleDebugEvaluate(this.sessionFactory.session, options.input);
    return wrapToolResult(result);
  }
}

// --- 5.5: Status/utility tools (Requirements 3.1, 4.5, 12.1-12.6, 13.1-13.3) ---

export class DebugStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Checking debug session status' };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) {
      // Callable in any state — return guidance when no session exists
      const result: ToolResult = {
        success: true,
        data: {
          state: 'not_started',
          guidance: 'No active session. Call debug_launch to start debugging.',
        },
      };
      return wrapToolResult(result);
    }
    const result = handleDebugStatus(this.sessionFactory.session);
    return wrapToolResult(result);
  }
}

export class DebugThreadsTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Listing debug threads' };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const result = await handleDebugThreads(this.sessionFactory.session);
    return wrapToolResult(result);
  }
}

export class DebugBreakpointsTool implements vscode.LanguageModelTool<BreakpointsInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<BreakpointsInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const { path, breakpoints } = options.input;
    return {
      invocationMessage: `Setting ${breakpoints.length} breakpoint(s) in ${path}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BreakpointsInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sessionFactory.session) return wrapToolResult(noSessionError());
    const result = await handleDebugSetBreakpoints(this.sessionFactory.session, options.input);
    return wrapToolResult(result);
  }
}

// --- 5.6: DebugBreakpointsGetTool (Requirements 3.1, 4.6, 12.7, 12.8) ---

export class DebugBreakpointsGetTool implements vscode.LanguageModelTool<BreakpointsGetInput> {
  constructor(private readonly sessionFactory: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<BreakpointsGetInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Reading breakpoints for ${options.input.path}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BreakpointsGetInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const ledger = this.sessionFactory.breakpointLedger;
    if (!ledger) return wrapToolResult(noSessionError());
    const breakpoints = ledger.getForFile(options.input.path);
    const result: ToolResult = { success: true, data: { path: options.input.path, breakpoints } };
    return wrapToolResult(result);
  }
}

// --- 5.8: registerAllLmTools (Requirements 2.1, 2.3) ---

export function registerAllLmTools(
  context: vscode.ExtensionContext,
  sessionFactory: SessionFactory,
): void {
  const tools: Array<[string, vscode.LanguageModelTool<any>]> = [
    ['debug_launch', new DebugLaunchTool(sessionFactory)],
    ['debug_terminate', new DebugTerminateTool(sessionFactory)],
    ['debug_status', new DebugStatusTool(sessionFactory)],
    ['debug_continue', new DebugContinueTool(sessionFactory)],
    ['debug_next', new DebugNextTool(sessionFactory)],
    ['debug_step_in', new DebugStepInTool(sessionFactory)],
    ['debug_step_out', new DebugStepOutTool(sessionFactory)],
    ['debug_pause', new DebugPauseTool(sessionFactory)],
    ['debug_stack_trace', new DebugStackTraceTool(sessionFactory)],
    ['debug_scopes', new DebugScopesTool(sessionFactory)],
    ['debug_variables', new DebugVariablesTool(sessionFactory)],
    ['debug_evaluate', new DebugEvaluateTool(sessionFactory)],
    ['debug_threads', new DebugThreadsTool(sessionFactory)],
    ['debug_breakpoints', new DebugBreakpointsTool(sessionFactory)],
    ['debug_breakpoints_get', new DebugBreakpointsGetTool(sessionFactory)],
  ];

  for (const [name, tool] of tools) {
    context.subscriptions.push(vscode.lm.registerTool(name, tool));
  }
}
