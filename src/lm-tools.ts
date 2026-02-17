import * as vscode from 'vscode';
import { errorResult } from 'ts-php-debug-mcp/tools/types.js';
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
import { wrapToolResult, noSessionResult } from './result-wrapper.js';
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

// --- Launch ---

export class DebugLaunchTool implements vscode.LanguageModelTool<LaunchInput> {
  constructor(private readonly sf: SessionFactory) {}

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
    const result = await this.sf.launch(options.input);
    return wrapToolResult(result);
  }
}


// --- Terminate ---

export class DebugTerminateTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      confirmationMessages: {
        title: 'Terminate Debug Session',
        message: new vscode.MarkdownString('End the current debug session?'),
      },
    };
  }

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    const result = await this.sf.terminate();
    return wrapToolResult(result);
  }
}

// --- Stepping tools (continue, next, stepIn, stepOut, pause) ---

export class DebugContinueTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Continuing execution on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const threadId = options.input.threadId ?? this.sf.session.stopInfo?.threadId;
    if (threadId === undefined) return wrapToolResult(errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS'));
    const result = await handleDebugContinue(this.sf.session, { threadId });
    return wrapToolResult(result);
  }
}

export class DebugNextTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Stepping over on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const threadId = options.input.threadId ?? this.sf.session.stopInfo?.threadId;
    if (threadId === undefined) return wrapToolResult(errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS'));
    const result = await handleDebugNext(this.sf.session, { threadId });
    return wrapToolResult(result);
  }
}

export class DebugStepInTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Stepping into on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const threadId = options.input.threadId ?? this.sf.session.stopInfo?.threadId;
    if (threadId === undefined) return wrapToolResult(errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS'));
    const result = await handleDebugStepIn(this.sf.session, { threadId });
    return wrapToolResult(result);
  }
}

export class DebugStepOutTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Stepping out on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const threadId = options.input.threadId ?? this.sf.session.stopInfo?.threadId;
    if (threadId === undefined) return wrapToolResult(errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS'));
    const result = await handleDebugStepOut(this.sf.session, { threadId });
    return wrapToolResult(result);
  }
}

export class DebugPauseTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Pausing execution on thread ${options.input.threadId ?? 'default'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const threadId = options.input.threadId ?? this.sf.session.stopInfo?.threadId;
    if (threadId === undefined) return wrapToolResult(errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS'));
    const result = await handleDebugPause(this.sf.session, { threadId });
    return wrapToolResult(result);
  }
}


// --- Inspection tools (stack_trace, scopes, variables, evaluate) ---

export class DebugStackTraceTool implements vscode.LanguageModelTool<ThreadIdInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Retrieving stack trace' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const threadId = options.input.threadId ?? this.sf.session.stopInfo?.threadId;
    if (threadId === undefined) return wrapToolResult(errorResult('threadId is required — no stopped thread available', 'INVALID_PARAMS'));
    const result = await handleDebugStackTrace(this.sf.session, { threadId });
    return wrapToolResult(result);
  }
}

export class DebugScopesTool implements vscode.LanguageModelTool<ScopesInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ScopesInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Retrieving scopes for frame ${options.input.frameId}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ScopesInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const result = await handleDebugScopes(this.sf.session, { frameId: options.input.frameId });
    return wrapToolResult(result);
  }
}

export class DebugVariablesTool implements vscode.LanguageModelTool<VariablesInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<VariablesInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Retrieving variables for ref ${options.input.variablesReference}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<VariablesInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const result = await handleDebugVariables(this.sf.session, {
      variablesReference: options.input.variablesReference,
      start: options.input.start,
      count: options.input.count,
    });
    return wrapToolResult(result);
  }
}

export class DebugEvaluateTool implements vscode.LanguageModelTool<EvaluateInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<EvaluateInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Evaluating: ${options.input.expression}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<EvaluateInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const result = await handleDebugEvaluate(this.sf.session, {
      expression: options.input.expression,
      frameId: options.input.frameId,
      context: options.input.context,
    });
    return wrapToolResult(result);
  }
}


// --- Status, threads, breakpoints, breakpoints_get ---

export class DebugStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Checking debug session status' };
  }

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) {
      return wrapToolResult({
        success: true,
        data: {
          state: 'not_started',
          guidance: 'No active session. Call debug_launch to start debugging.',
        },
      });
    }
    const result = handleDebugStatus(this.sf.session);
    return wrapToolResult(result);
  }
}

export class DebugThreadsTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Listing debug threads' };
  }

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const result = await handleDebugThreads(this.sf.session);
    return wrapToolResult(result);
  }
}

export class DebugBreakpointsTool implements vscode.LanguageModelTool<BreakpointsInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<BreakpointsInput>,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Setting ${options.input.breakpoints.length} breakpoint(s) in ${options.input.path}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BreakpointsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.session) return wrapToolResult(noSessionResult());
    const result = await handleDebugSetBreakpoints(this.sf.session, {
      path: options.input.path,
      breakpoints: options.input.breakpoints,
    });
    return wrapToolResult(result);
  }
}

export class DebugBreakpointsGetTool implements vscode.LanguageModelTool<BreakpointsGetInput> {
  constructor(private readonly sf: SessionFactory) {}

  prepareInvocation(): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Retrieving breakpoints' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BreakpointsGetInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.sf.breakpointLedger) return wrapToolResult(noSessionResult());
    const breakpoints = this.sf.breakpointLedger.getForFile(options.input.path);
    return wrapToolResult({ success: true, data: breakpoints });
  }
}

// --- Register all tools ---

export function registerAllLmTools(
  context: vscode.ExtensionContext,
  sf: SessionFactory,
): void {
  const tools: Array<[string, vscode.LanguageModelTool<any>]> = [
    ['debug_launch', new DebugLaunchTool(sf)],
    ['debug_terminate', new DebugTerminateTool(sf)],
    ['debug_status', new DebugStatusTool(sf)],
    ['debug_continue', new DebugContinueTool(sf)],
    ['debug_next', new DebugNextTool(sf)],
    ['debug_step_in', new DebugStepInTool(sf)],
    ['debug_step_out', new DebugStepOutTool(sf)],
    ['debug_pause', new DebugPauseTool(sf)],
    ['debug_stack_trace', new DebugStackTraceTool(sf)],
    ['debug_scopes', new DebugScopesTool(sf)],
    ['debug_variables', new DebugVariablesTool(sf)],
    ['debug_evaluate', new DebugEvaluateTool(sf)],
    ['debug_threads', new DebugThreadsTool(sf)],
    ['debug_breakpoints', new DebugBreakpointsTool(sf)],
    ['debug_breakpoints_get', new DebugBreakpointsGetTool(sf)],
  ];

  for (const [name, tool] of tools) {
    context.subscriptions.push(vscode.lm.registerTool(name, tool));
  }
}
