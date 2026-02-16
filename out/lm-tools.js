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
exports.registerAllLmTools = registerAllLmTools;
const vscode = __importStar(require("vscode"));
function ok(data) {
    return { success: true, data };
}
function err(message, code = 'DAP_ERROR') {
    return { success: false, error: { message, code } };
}
function wrap(result) {
    const payload = result.success ? result.data : result.error;
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2)),
    ]);
}
function noSession() {
    return err('No active debug session. Call debug_launch first.', 'SESSION_NOT_STARTED');
}
// --- Helper: resolve threadId from input or last stopped thread ---
function resolveThreadId(mgr, input) {
    if (input.threadId !== undefined)
        return input.threadId;
    if (mgr.stopInfo)
        return mgr.stopInfo.threadId;
    return err('threadId is required — no stopped thread available', 'INVALID_PARAMS');
}
// --- Launch ---
class DebugLaunchTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation(options, _token) {
        const port = options.input.port ?? 'default';
        return {
            confirmationMessages: {
                title: 'Launch Debug Session',
                message: new vscode.MarkdownString(`Start PHP debug session on port **${port}**?`),
            },
        };
    }
    async invoke(options, _token) {
        try {
            await this.mgr.launch(options.input);
            return wrap(ok({
                status: this.mgr.state,
                message: `Debug session launched, listening on port ${options.input.port ?? 9003}`,
            }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Terminate ---
class DebugTerminateTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation() {
        return {
            confirmationMessages: {
                title: 'Terminate Debug Session',
                message: new vscode.MarkdownString('End the current debug session?'),
            },
        };
    }
    async invoke() {
        try {
            await this.mgr.terminate();
            return wrap(ok({ status: 'terminated', message: 'Debug session terminated' }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Simple DAP command tool (continue, next, stepIn, stepOut, pause) ---
function makeStepTool(command, label) {
    return class {
        mgr;
        constructor(mgr) {
            this.mgr = mgr;
        }
        prepareInvocation(options) {
            return { invocationMessage: `${label} on thread ${options.input.threadId ?? 'default'}` };
        }
        async invoke(options) {
            if (!this.mgr.activeSession)
                return wrap(noSession());
            const tid = resolveThreadId(this.mgr, options.input);
            if (typeof tid !== 'number')
                return wrap(tid);
            try {
                await this.mgr.customRequest(command, { threadId: tid });
                return wrap(ok({ threadId: tid, message: `${label} on thread ${tid}` }));
            }
            catch (e) {
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
class DebugStackTraceTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation() {
        return { invocationMessage: 'Retrieving stack trace' };
    }
    async invoke(options) {
        if (!this.mgr.activeSession)
            return wrap(noSession());
        const tid = resolveThreadId(this.mgr, options.input);
        if (typeof tid !== 'number')
            return wrap(tid);
        try {
            const body = await this.mgr.customRequest('stackTrace', { threadId: tid });
            const frames = (body?.stackFrames ?? []).map((f) => ({
                id: f.id,
                name: f.name,
                source: f.source ? { name: f.source.name, path: f.source.path, sourceReference: f.source.sourceReference } : undefined,
                line: f.line,
                column: f.column,
            }));
            return wrap(ok({ stackFrames: frames, totalFrames: body?.totalFrames }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Scopes ---
class DebugScopesTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation(options) {
        return { invocationMessage: `Retrieving scopes for frame ${options.input.frameId}` };
    }
    async invoke(options) {
        if (!this.mgr.activeSession)
            return wrap(noSession());
        try {
            const body = await this.mgr.customRequest('scopes', { frameId: options.input.frameId });
            const scopes = (body?.scopes ?? []).map((s) => ({
                name: s.name,
                variablesReference: s.variablesReference,
                namedVariables: s.namedVariables,
                indexedVariables: s.indexedVariables,
                expensive: s.expensive,
            }));
            return wrap(ok({ scopes }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Variables ---
class DebugVariablesTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation(options) {
        return { invocationMessage: `Retrieving variables for ref ${options.input.variablesReference}` };
    }
    async invoke(options) {
        if (!this.mgr.activeSession)
            return wrap(noSession());
        try {
            const args = { variablesReference: options.input.variablesReference };
            if (options.input.start !== undefined)
                args.start = options.input.start;
            if (options.input.count !== undefined)
                args.count = options.input.count;
            const body = await this.mgr.customRequest('variables', args);
            const variables = (body?.variables ?? []).map((v) => ({
                name: v.name,
                value: v.value,
                type: v.type,
                variablesReference: v.variablesReference ?? 0,
                indexedVariables: v.indexedVariables,
                namedVariables: v.namedVariables,
            }));
            return wrap(ok({ variables }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Evaluate ---
class DebugEvaluateTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation(options) {
        return { invocationMessage: `Evaluating: ${options.input.expression}` };
    }
    async invoke(options) {
        if (!this.mgr.activeSession)
            return wrap(noSession());
        try {
            const args = {
                expression: options.input.expression,
                context: options.input.context ?? 'repl',
            };
            if (options.input.frameId !== undefined)
                args.frameId = options.input.frameId;
            const body = await this.mgr.customRequest('evaluate', args);
            return wrap(ok({
                result: body?.result,
                type: body?.type,
                variablesReference: body?.variablesReference ?? 0,
                indexedVariables: body?.indexedVariables,
                namedVariables: body?.namedVariables,
            }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Status ---
class DebugStatusTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation() {
        return { invocationMessage: 'Checking debug session status' };
    }
    async invoke() {
        const guidance = {
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
class DebugThreadsTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation() {
        return { invocationMessage: 'Listing debug threads' };
    }
    async invoke() {
        if (!this.mgr.activeSession)
            return wrap(noSession());
        try {
            const body = await this.mgr.customRequest('threads');
            const threads = (body?.threads ?? []).map((t) => ({ id: t.id, name: t.name }));
            return wrap(ok({ threads }));
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Set Breakpoints ---
class DebugBreakpointsTool {
    mgr;
    constructor(mgr) {
        this.mgr = mgr;
    }
    prepareInvocation(options) {
        return { invocationMessage: `Setting ${options.input.breakpoints.length} breakpoint(s) in ${options.input.path}` };
    }
    async invoke(options) {
        if (!this.mgr.activeSession)
            return wrap(noSession());
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
            const breakpoints = (body?.breakpoints ?? []).map((bp) => ({
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
        }
        catch (e) {
            return wrap(err(e instanceof Error ? e.message : String(e)));
        }
    }
}
// --- Register all tools ---
function registerAllLmTools(context, mgr) {
    const tools = [
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
//# sourceMappingURL=lm-tools.js.map