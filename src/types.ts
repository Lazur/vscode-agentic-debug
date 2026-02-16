import type * as vscode from 'vscode';

/** Input for debug_launch tool (Requirement 17.1). */
export interface LaunchInput {
  port?: number;
  backendMode?: 'headless' | 'ui';
  pathMappings?: Record<string, string>;
  stopOnEntry?: boolean;
}

/** Input for debug_breakpoints tool (Requirement 17.2). */
export interface BreakpointsInput {
  path: string;
  breakpoints: Array<{ line: number; condition?: string; hitCondition?: string }>;
}

/** Input for debug_breakpoints_get tool (Requirement 17.3). */
export interface BreakpointsGetInput {
  path: string;
}

/** Input for stepping/pause tools (Requirement 17.4). */
export interface ThreadIdInput {
  threadId?: number;
}

/** Input for debug_scopes tool (Requirement 17.5). */
export interface ScopesInput {
  frameId: number;
}

/** Input for debug_variables tool (Requirement 17.6). */
export interface VariablesInput {
  variablesReference: number;
  start?: number;
  count?: number;
}

/** Input for debug_evaluate tool (Requirement 17.7). */
export interface EvaluateInput {
  expression: string;
  frameId?: number;
  context?: 'repl' | 'watch' | 'hover';
}

/** Tracking entry for active agent debug sessions (Requirements 6.1, 15.5). */
export interface AgentSessionEntry {
  sessionId: string;
  backendMode: 'headless' | 'ui';
  launchTimestamp: number;
  debugSession?: vscode.DebugSession;
}
