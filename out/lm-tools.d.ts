import * as vscode from 'vscode';
import type { SessionFactory } from './session-factory.js';
import type { LaunchInput, ThreadIdInput, ScopesInput, VariablesInput, EvaluateInput, BreakpointsInput, BreakpointsGetInput } from './types.js';
export declare class DebugLaunchTool implements vscode.LanguageModelTool<LaunchInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<LaunchInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<LaunchInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugTerminateTool implements vscode.LanguageModelTool<Record<string, never>> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(_options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugContinueTool implements vscode.LanguageModelTool<ThreadIdInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugNextTool implements vscode.LanguageModelTool<ThreadIdInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugStepInTool implements vscode.LanguageModelTool<ThreadIdInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugStepOutTool implements vscode.LanguageModelTool<ThreadIdInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugPauseTool implements vscode.LanguageModelTool<ThreadIdInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugStackTraceTool implements vscode.LanguageModelTool<ThreadIdInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<ThreadIdInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ThreadIdInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugScopesTool implements vscode.LanguageModelTool<ScopesInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ScopesInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<ScopesInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugVariablesTool implements vscode.LanguageModelTool<VariablesInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<VariablesInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<VariablesInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugEvaluateTool implements vscode.LanguageModelTool<EvaluateInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<EvaluateInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<EvaluateInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(_options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugThreadsTool implements vscode.LanguageModelTool<Record<string, never>> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(_options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugBreakpointsTool implements vscode.LanguageModelTool<BreakpointsInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<BreakpointsInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<BreakpointsInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare class DebugBreakpointsGetTool implements vscode.LanguageModelTool<BreakpointsGetInput> {
    private readonly sessionFactory;
    constructor(sessionFactory: SessionFactory);
    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<BreakpointsGetInput>, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation>;
    invoke(options: vscode.LanguageModelToolInvocationOptions<BreakpointsGetInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
}
export declare function registerAllLmTools(context: vscode.ExtensionContext, sessionFactory: SessionFactory): void;
