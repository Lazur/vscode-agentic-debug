"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));

// src/debug-session-manager.ts
var vscode = __toESM(require("vscode"));
var DebugSessionManager = class {
  constructor(outputChannel) {
    this.outputChannel = outputChannel;
  }
  session = null;
  disposables = [];
  _state = "not_started";
  _stopInfo;
  get state() {
    return this._state;
  }
  get stopInfo() {
    return this._stopInfo;
  }
  get activeSession() {
    return this.session;
  }
  /**
   * Start a new debug session by calling vscode.debug.startDebugging
   * with type: "php". xdebug.php-debug handles everything — config,
   * pathMappings, adapter lifecycle.
   */
  async launch(params) {
    if (this.session) {
      await this.terminate();
    }
    this.registerEventListeners();
    this.setState("launching");
    const settings = vscode.workspace.getConfiguration("agenticDebug");
    const nonEmpty = (m) => m && Object.keys(m).length > 0 ? m : void 0;
    const resolvedPathMappings = nonEmpty(params.pathMappings) ?? nonEmpty(settings.get("pathMappings")) ?? this.getPathMappingsFromLaunchJson() ?? {};
    const config = {
      type: "php",
      name: "Agentic Debug Session",
      request: "launch",
      port: params.port ?? settings.get("port") ?? 9003,
      hostname: params.hostname ?? settings.get("hostname") ?? "127.0.0.1",
      stopOnEntry: params.stopOnEntry ?? settings.get("stopOnEntry") ?? true,
      pathMappings: resolvedPathMappings,
      maxConnections: settings.get("maxConnections") ?? 0,
      log: params.log ?? false
    };
    this.outputChannel.appendLine(
      `[launch] Starting debug session with config: ${JSON.stringify(config)}`
    );
    const sessionReady = this.awaitSessionStart();
    const folder = vscode.workspace.workspaceFolders?.[0];
    let started = await vscode.debug.startDebugging(folder, config);
    if (!started) {
      started = await vscode.debug.startDebugging(void 0, config);
    }
    if (!started) {
      this.setState("not_started");
      throw new Error("Failed to start VS Code debug session");
    }
    await sessionReady;
    this.setState("listening");
  }
  /** Terminate the active debug session. */
  async terminate() {
    if (this.session) {
      await vscode.debug.stopDebugging(this.session);
    }
    this.cleanup();
  }
  /** Send a DAP request through the active session. */
  async customRequest(command, args) {
    if (!this.session) {
      throw new Error("No active debug session");
    }
    return this.session.customRequest(command, args);
  }
  // --- Private helpers ---
  setState(state) {
    const old = this._state;
    this._state = state;
    this.outputChannel.appendLine(`[state] ${old} \u2192 ${state}`);
  }
  /**
   * Scan workspace launch.json for a PHP debug config that has pathMappings.
   * Returns the first non-empty pathMappings found, or undefined.
   */
  getPathMappingsFromLaunchJson() {
    const launchConfig = vscode.workspace.getConfiguration("launch");
    const configurations = launchConfig.get("configurations");
    if (!configurations) return void 0;
    for (const cfg of configurations) {
      if (cfg.type === "php" && cfg.pathMappings && Object.keys(cfg.pathMappings).length > 0) {
        this.outputChannel.appendLine(
          `[launch] Using pathMappings from launch.json config "${cfg.name}": ${JSON.stringify(cfg.pathMappings)}`
        );
        return cfg.pathMappings;
      }
    }
    return void 0;
  }
  registerEventListeners() {
    this.disposeListeners();
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((s) => {
        if (s === this.session || s.type === "php" && !this.session) {
          this.session = s;
          this.outputChannel.appendLine(
            `[session] Started: ${s.name} (id=${s.id})`
          );
          this.outputChannel.appendLine(
            `[session] Config: ${JSON.stringify(s.configuration)}`
          );
        }
      }),
      vscode.debug.onDidTerminateDebugSession((s) => {
        if (s === this.session) {
          this.outputChannel.appendLine(`[session] Terminated: ${s.name}`);
          this.setState("terminated");
          this.session = null;
          this._stopInfo = void 0;
        }
      }),
      vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
        if (e.session !== this.session) return;
        if (e.event === "stopped") {
          this._stopInfo = {
            reason: e.body?.reason ?? "unknown",
            threadId: e.body?.threadId ?? 0,
            description: e.body?.description,
            allThreadsStopped: e.body?.allThreadsStopped
          };
          this.setState("paused");
          this.outputChannel.appendLine(
            `[event] stopped: ${this._stopInfo.reason} (thread ${this._stopInfo.threadId})`
          );
        } else if (e.event === "continued") {
          this._stopInfo = void 0;
          this.setState("connected");
        } else if (e.event === "thread") {
          if (this._state === "listening") {
            this.setState("connected");
          }
          this.outputChannel.appendLine(
            `[event] thread: ${e.body?.reason} (id=${e.body?.threadId})`
          );
        }
      })
    );
  }
  awaitSessionStart(timeoutMs = 3e4) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        disposable.dispose();
        reject(new Error("Timeout waiting for debug session to start"));
      }, timeoutMs);
      const disposable = vscode.debug.onDidStartDebugSession((s) => {
        if (s.type === "php") {
          clearTimeout(timeout);
          disposable.dispose();
          this.session = s;
          resolve();
        }
      });
      this.disposables.push(disposable);
    });
  }
  disposeListeners() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
  cleanup() {
    this.disposeListeners();
    this.session = null;
    this._state = "not_started";
    this._stopInfo = void 0;
  }
  dispose() {
    this.cleanup();
  }
};

// src/lm-tools.ts
var vscode2 = __toESM(require("vscode"));
function ok(data) {
  return { success: true, data };
}
function err(message, code = "DAP_ERROR") {
  return { success: false, error: { message, code } };
}
function wrap(result) {
  const payload = result.success ? result.data : result.error;
  return new vscode2.LanguageModelToolResult([
    new vscode2.LanguageModelTextPart(JSON.stringify(payload, null, 2))
  ]);
}
function noSession() {
  return err("No active debug session. Call debug_launch first.", "SESSION_NOT_STARTED");
}
function resolveThreadId(mgr, input) {
  if (input.threadId !== void 0) return input.threadId;
  if (mgr.stopInfo) return mgr.stopInfo.threadId;
  return err("threadId is required \u2014 no stopped thread available", "INVALID_PARAMS");
}
var DebugLaunchTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation(options, _token) {
    const port = options.input.port ?? "default";
    return {
      confirmationMessages: {
        title: "Launch Debug Session",
        message: new vscode2.MarkdownString(`Start PHP debug session on port **${port}**?`)
      }
    };
  }
  async invoke(options, _token) {
    try {
      await this.mgr.launch(options.input);
      return wrap(ok({
        status: this.mgr.state,
        message: `Debug session launched, listening on port ${options.input.port ?? 9003}`
      }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
var DebugTerminateTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation() {
    return {
      confirmationMessages: {
        title: "Terminate Debug Session",
        message: new vscode2.MarkdownString("End the current debug session?")
      }
    };
  }
  async invoke() {
    try {
      await this.mgr.terminate();
      return wrap(ok({ status: "terminated", message: "Debug session terminated" }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
function makeStepTool(command, label) {
  return class {
    constructor(mgr) {
      this.mgr = mgr;
    }
    prepareInvocation(options) {
      return { invocationMessage: `${label} on thread ${options.input.threadId ?? "default"}` };
    }
    async invoke(options) {
      if (!this.mgr.activeSession) return wrap(noSession());
      const tid = resolveThreadId(this.mgr, options.input);
      if (typeof tid !== "number") return wrap(tid);
      try {
        await this.mgr.customRequest(command, { threadId: tid });
        return wrap(ok({ threadId: tid, message: `${label} on thread ${tid}` }));
      } catch (e) {
        return wrap(err(e instanceof Error ? e.message : String(e)));
      }
    }
  };
}
var DebugContinueTool = makeStepTool("continue", "Continued execution");
var DebugNextTool = makeStepTool("next", "Stepped over");
var DebugStepInTool = makeStepTool("stepIn", "Stepped into");
var DebugStepOutTool = makeStepTool("stepOut", "Stepped out");
var DebugPauseTool = makeStepTool("pause", "Paused execution");
var DebugStackTraceTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation() {
    return { invocationMessage: "Retrieving stack trace" };
  }
  async invoke(options) {
    if (!this.mgr.activeSession) return wrap(noSession());
    const tid = resolveThreadId(this.mgr, options.input);
    if (typeof tid !== "number") return wrap(tid);
    try {
      const body = await this.mgr.customRequest("stackTrace", { threadId: tid });
      const frames = (body?.stackFrames ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        source: f.source ? { name: f.source.name, path: f.source.path, sourceReference: f.source.sourceReference } : void 0,
        line: f.line,
        column: f.column
      }));
      return wrap(ok({ stackFrames: frames, totalFrames: body?.totalFrames }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
var DebugScopesTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation(options) {
    return { invocationMessage: `Retrieving scopes for frame ${options.input.frameId}` };
  }
  async invoke(options) {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const body = await this.mgr.customRequest("scopes", { frameId: options.input.frameId });
      const scopes = (body?.scopes ?? []).map((s) => ({
        name: s.name,
        variablesReference: s.variablesReference,
        namedVariables: s.namedVariables,
        indexedVariables: s.indexedVariables,
        expensive: s.expensive
      }));
      return wrap(ok({ scopes }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
var DebugVariablesTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation(options) {
    return { invocationMessage: `Retrieving variables for ref ${options.input.variablesReference}` };
  }
  async invoke(options) {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const args = { variablesReference: options.input.variablesReference };
      if (options.input.start !== void 0) args.start = options.input.start;
      if (options.input.count !== void 0) args.count = options.input.count;
      const body = await this.mgr.customRequest("variables", args);
      const variables = (body?.variables ?? []).map((v) => ({
        name: v.name,
        value: v.value,
        type: v.type,
        variablesReference: v.variablesReference ?? 0,
        indexedVariables: v.indexedVariables,
        namedVariables: v.namedVariables
      }));
      return wrap(ok({ variables }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
var DebugEvaluateTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation(options) {
    return { invocationMessage: `Evaluating: ${options.input.expression}` };
  }
  async invoke(options) {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const args = {
        expression: options.input.expression,
        context: options.input.context ?? "repl"
      };
      if (options.input.frameId !== void 0) args.frameId = options.input.frameId;
      const body = await this.mgr.customRequest("evaluate", args);
      return wrap(ok({
        result: body?.result,
        type: body?.type,
        variablesReference: body?.variablesReference ?? 0,
        indexedVariables: body?.indexedVariables,
        namedVariables: body?.namedVariables
      }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
var DebugStatusTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation() {
    return { invocationMessage: "Checking debug session status" };
  }
  async invoke() {
    const guidance = {
      not_started: "No active session. Call debug_launch to start debugging.",
      launching: "Session is starting. Wait a moment and check again.",
      listening: "Listening for Xdebug connections. Trigger your PHP script now.",
      connected: "Xdebug connected, execution running. Set breakpoints or call debug_pause.",
      paused: "Execution paused. Inspect with debug_stack_trace, debug_variables, debug_evaluate. Step with debug_next/debug_step_in/debug_step_out. Resume with debug_continue.",
      terminated: "Session ended. Call debug_launch to start a new session."
    };
    return wrap(ok({
      state: this.mgr.state,
      stopInfo: this.mgr.stopInfo,
      guidance: guidance[this.mgr.state] ?? "Unknown state."
    }));
  }
};
var DebugThreadsTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation() {
    return { invocationMessage: "Listing debug threads" };
  }
  async invoke() {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const body = await this.mgr.customRequest("threads");
      const threads = (body?.threads ?? []).map((t) => ({ id: t.id, name: t.name }));
      return wrap(ok({ threads }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
var DebugBreakpointsTool = class {
  constructor(mgr) {
    this.mgr = mgr;
  }
  prepareInvocation(options) {
    return { invocationMessage: `Setting ${options.input.breakpoints.length} breakpoint(s) in ${options.input.path}` };
  }
  async invoke(options) {
    if (!this.mgr.activeSession) return wrap(noSession());
    try {
      const body = await this.mgr.customRequest("setBreakpoints", {
        source: { path: options.input.path },
        breakpoints: options.input.breakpoints.map((bp) => ({
          line: bp.line,
          ...bp.condition !== void 0 ? { condition: bp.condition } : {},
          ...bp.hitCondition !== void 0 ? { hitCondition: bp.hitCondition } : {},
          ...bp.logMessage !== void 0 ? { logMessage: bp.logMessage } : {}
        }))
      });
      const breakpoints = (body?.breakpoints ?? []).map((bp) => ({
        verified: bp.verified,
        line: bp.line,
        id: bp.id,
        message: bp.message
      }));
      return wrap(ok({
        path: options.input.path,
        breakpoints,
        message: `Set ${breakpoints.length} breakpoint(s) in ${options.input.path}`
      }));
    } catch (e) {
      return wrap(err(e instanceof Error ? e.message : String(e)));
    }
  }
};
function registerAllLmTools(context, mgr) {
  const tools = [
    ["debug_launch", new DebugLaunchTool(mgr)],
    ["debug_terminate", new DebugTerminateTool(mgr)],
    ["debug_status", new DebugStatusTool(mgr)],
    ["debug_continue", new DebugContinueTool(mgr)],
    ["debug_next", new DebugNextTool(mgr)],
    ["debug_step_in", new DebugStepInTool(mgr)],
    ["debug_step_out", new DebugStepOutTool(mgr)],
    ["debug_pause", new DebugPauseTool(mgr)],
    ["debug_stack_trace", new DebugStackTraceTool(mgr)],
    ["debug_scopes", new DebugScopesTool(mgr)],
    ["debug_variables", new DebugVariablesTool(mgr)],
    ["debug_evaluate", new DebugEvaluateTool(mgr)],
    ["debug_threads", new DebugThreadsTool(mgr)],
    ["debug_breakpoints", new DebugBreakpointsTool(mgr)]
  ];
  for (const [name, tool] of tools) {
    context.subscriptions.push(vscode2.lm.registerTool(name, tool));
  }
}

// src/extension.ts
var sessionManager;
function activate(context) {
  const outputChannel = vscode3.window.createOutputChannel("Agentic Debug");
  sessionManager = new DebugSessionManager(outputChannel);
  if (typeof vscode3.lm?.registerTool === "function") {
    registerAllLmTools(context, sessionManager);
  } else {
    outputChannel.appendLine(
      "[WARN] vscode.lm.registerTool not available \u2014 LM tool registration skipped"
    );
  }
  context.subscriptions.push(outputChannel);
}
async function deactivate() {
  if (sessionManager) {
    await sessionManager.terminate();
    sessionManager = void 0;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
