"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugBreakpointsGetTool = exports.DebugBreakpointsTool = exports.DebugThreadsTool = exports.DebugStatusTool = exports.DebugEvaluateTool = exports.DebugVariablesTool = exports.DebugScopesTool = exports.DebugStackTraceTool = exports.DebugPauseTool = exports.DebugStepOutTool = exports.DebugStepInTool = exports.DebugNextTool = exports.DebugContinueTool = exports.DebugTerminateTool = exports.DebugLaunchTool = void 0;
exports.registerAllLmTools = registerAllLmTools;
const vscode = __importStar(require("vscode"));
const debug_continue_js_1 = require("ts-php-debug-mcp/tools/debug-continue.js");
const debug_next_js_1 = require("ts-php-debug-mcp/tools/debug-next.js");
const debug_step_in_js_1 = require("ts-php-debug-mcp/tools/debug-step-in.js");
const debug_step_out_js_1 = require("ts-php-debug-mcp/tools/debug-step-out.js");
const debug_pause_js_1 = require("ts-php-debug-mcp/tools/debug-pause.js");
const debug_stack_trace_js_1 = require("ts-php-debug-mcp/tools/debug-stack-trace.js");
const debug_scopes_js_1 = require("ts-php-debug-mcp/tools/debug-scopes.js");
const debug_variables_js_1 = require("ts-php-debug-mcp/tools/debug-variables.js");
const debug_evaluate_js_1 = require("ts-php-debug-mcp/tools/debug-evaluate.js");
const debug_status_js_1 = require("ts-php-debug-mcp/tools/debug-status.js");
const debug_threads_js_1 = require("ts-php-debug-mcp/tools/debug-threads.js");
const debug_set_breakpoints_js_1 = require("ts-php-debug-mcp/tools/debug-set-breakpoints.js");
const types_js_1 = require("ts-php-debug-mcp/tools/types.js");
const result_wrapper_js_1 = require("./result-wrapper.js");
// --- Helper ---
function noSessionError() {
    return (0, types_js_1.errorResult)('No active debug session. Call debug_launch first.', 'SESSION_NOT_STARTED');
}
function noThreadIdError() {
    return (0, types_js_1.errorResult)('threadId is required — no stopped thread available', 'INVALID_PARAMS');
}
// --- 5.1: DebugLaunchTool (Requirements 3.1, 3.4, 3.5, 4.1, 5.1-5.5) ---
class DebugLaunchTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        const mode = options.input.backendMode ?? 'ui';
        const port = options.input.port ?? 'default';
        return {
            confirmationMessages: {
                title: 'Launch Debug Session',
                message: new vscode.MarkdownString(`Start **${mode}** debug session on port **${port}**?`),
            },
        };
    }
    async invoke(options, _token) {
        const result = await this.sessionFactory.launch(options.input);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugLaunchTool = DebugLaunchTool;
// --- 5.2: DebugTerminateTool (Requirements 3.1, 3.4, 3.5, 4.2) ---
class DebugTerminateTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(_options, _token) {
        return {
            confirmationMessages: {
                title: 'Terminate Debug Session',
                message: new vscode.MarkdownString('End the current debug session?'),
            },
        };
    }
    async invoke(_options, _token) {
        const result = await this.sessionFactory.terminate();
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugTerminateTool = DebugTerminateTool;
// --- 5.3: Stepping tools (Requirements 3.1, 3.4, 4.3, 10.1-10.6) ---
/** Resolve threadId from input or session.stopInfo, returning an error ToolResult if neither available. */
function resolveThreadId(sessionFactory, input) {
    if (input.threadId !== undefined)
        return { threadId: input.threadId };
    const stopInfo = sessionFactory.session?.stopInfo;
    if (stopInfo)
        return { threadId: stopInfo.threadId };
    return { error: noThreadIdError() };
}
class DebugContinueTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Continuing execution on thread ${options.input.threadId ?? 'default'}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const resolved = resolveThreadId(this.sessionFactory, options.input);
        if ('error' in resolved)
            return (0, result_wrapper_js_1.wrapToolResult)(resolved.error);
        const result = await (0, debug_continue_js_1.handleDebugContinue)(this.sessionFactory.session, { threadId: resolved.threadId });
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugContinueTool = DebugContinueTool;
class DebugNextTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Stepping over on thread ${options.input.threadId ?? 'default'}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const resolved = resolveThreadId(this.sessionFactory, options.input);
        if ('error' in resolved)
            return (0, result_wrapper_js_1.wrapToolResult)(resolved.error);
        const result = await (0, debug_next_js_1.handleDebugNext)(this.sessionFactory.session, { threadId: resolved.threadId });
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugNextTool = DebugNextTool;
class DebugStepInTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Stepping into on thread ${options.input.threadId ?? 'default'}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const resolved = resolveThreadId(this.sessionFactory, options.input);
        if ('error' in resolved)
            return (0, result_wrapper_js_1.wrapToolResult)(resolved.error);
        const result = await (0, debug_step_in_js_1.handleDebugStepIn)(this.sessionFactory.session, { threadId: resolved.threadId });
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugStepInTool = DebugStepInTool;
class DebugStepOutTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Stepping out on thread ${options.input.threadId ?? 'default'}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const resolved = resolveThreadId(this.sessionFactory, options.input);
        if ('error' in resolved)
            return (0, result_wrapper_js_1.wrapToolResult)(resolved.error);
        const result = await (0, debug_step_out_js_1.handleDebugStepOut)(this.sessionFactory.session, { threadId: resolved.threadId });
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugStepOutTool = DebugStepOutTool;
class DebugPauseTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Pausing execution on thread ${options.input.threadId ?? 'default'}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const resolved = resolveThreadId(this.sessionFactory, options.input);
        if ('error' in resolved)
            return (0, result_wrapper_js_1.wrapToolResult)(resolved.error);
        const result = await (0, debug_pause_js_1.handleDebugPause)(this.sessionFactory.session, { threadId: resolved.threadId });
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugPauseTool = DebugPauseTool;
// --- 5.4: Inspection tools (Requirements 3.1, 3.4, 4.4, 11.1-11.5) ---
class DebugStackTraceTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(_options, _token) {
        return { invocationMessage: 'Retrieving stack trace' };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const resolved = resolveThreadId(this.sessionFactory, options.input);
        if ('error' in resolved)
            return (0, result_wrapper_js_1.wrapToolResult)(resolved.error);
        const result = await (0, debug_stack_trace_js_1.handleDebugStackTrace)(this.sessionFactory.session, { threadId: resolved.threadId });
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugStackTraceTool = DebugStackTraceTool;
class DebugScopesTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Retrieving scopes for frame ${options.input.frameId}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const result = await (0, debug_scopes_js_1.handleDebugScopes)(this.sessionFactory.session, options.input);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugScopesTool = DebugScopesTool;
class DebugVariablesTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Retrieving variables for reference ${options.input.variablesReference}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const result = await (0, debug_variables_js_1.handleDebugVariables)(this.sessionFactory.session, options.input);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugVariablesTool = DebugVariablesTool;
class DebugEvaluateTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Evaluating: ${options.input.expression}` };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const result = await (0, debug_evaluate_js_1.handleDebugEvaluate)(this.sessionFactory.session, options.input);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugEvaluateTool = DebugEvaluateTool;
// --- 5.5: Status/utility tools (Requirements 3.1, 4.5, 12.1-12.6, 13.1-13.3) ---
class DebugStatusTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(_options, _token) {
        return { invocationMessage: 'Checking debug session status' };
    }
    async invoke(_options, _token) {
        if (!this.sessionFactory.session) {
            // Callable in any state — return guidance when no session exists
            const result = {
                success: true,
                data: {
                    state: 'not_started',
                    guidance: 'No active session. Call debug_launch to start debugging.',
                },
            };
            return (0, result_wrapper_js_1.wrapToolResult)(result);
        }
        const result = (0, debug_status_js_1.handleDebugStatus)(this.sessionFactory.session);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugStatusTool = DebugStatusTool;
class DebugThreadsTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(_options, _token) {
        return { invocationMessage: 'Listing debug threads' };
    }
    async invoke(_options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const result = await (0, debug_threads_js_1.handleDebugThreads)(this.sessionFactory.session);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugThreadsTool = DebugThreadsTool;
class DebugBreakpointsTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        const { path, breakpoints } = options.input;
        return {
            invocationMessage: `Setting ${breakpoints.length} breakpoint(s) in ${path}`,
        };
    }
    async invoke(options, _token) {
        if (!this.sessionFactory.session)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const result = await (0, debug_set_breakpoints_js_1.handleDebugSetBreakpoints)(this.sessionFactory.session, options.input);
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugBreakpointsTool = DebugBreakpointsTool;
// --- 5.6: DebugBreakpointsGetTool (Requirements 3.1, 4.6, 12.7, 12.8) ---
class DebugBreakpointsGetTool {
    sessionFactory;
    constructor(sessionFactory) {
        this.sessionFactory = sessionFactory;
    }
    prepareInvocation(options, _token) {
        return { invocationMessage: `Reading breakpoints for ${options.input.path}` };
    }
    async invoke(options, _token) {
        const ledger = this.sessionFactory.breakpointLedger;
        if (!ledger)
            return (0, result_wrapper_js_1.wrapToolResult)(noSessionError());
        const breakpoints = ledger.getForFile(options.input.path);
        const result = { success: true, data: { path: options.input.path, breakpoints } };
        return (0, result_wrapper_js_1.wrapToolResult)(result);
    }
}
exports.DebugBreakpointsGetTool = DebugBreakpointsGetTool;
// --- 5.8: registerAllLmTools (Requirements 2.1, 2.3) ---
function registerAllLmTools(context, sessionFactory) {
    const tools = [
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
//# sourceMappingURL=lm-tools.js.map