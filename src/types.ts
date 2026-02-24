import type * as vscode from 'vscode';
import type {
  DebugLaunchInput,
  DebugEvaluateInput,
  DebugVariablesInput,
  DebugScopesInput,
  DebugSetBreakpointsInput,
  DebugStackTraceInput,
} from 'ts-php-debug-mcp/tools/schemas.js';

// Re-export Zod-inferred types so consumers can import from this file
export type {
  DebugLaunchInput,
  DebugEvaluateInput,
  DebugVariablesInput,
  DebugScopesInput,
  DebugSetBreakpointsInput,
  DebugStackTraceInput,
};

/** Input for debug_launch tool — extends DebugLaunchInput with VS Code-specific fields. */
export interface LaunchInput {
  port?: number;
  backendMode?: 'headless' | 'ui';
  pathMappings?: Record<string, string>;
  stopOnEntry?: boolean;
  hostname?: string;
  log?: boolean;
}

/** Input for debug_breakpoints_get tool (Requirement 17.3). */
export interface BreakpointsGetInput {
  path: string;
}

/** Input for stepping/pause tools (Requirement 17.4). */
export interface ThreadIdInput {
  threadId?: number;
}

/** Input for debug_wait tool (Requirement 1.2). */
export interface WaitInput {
  timeout?: number;
}

/** Tracking entry for active agent debug sessions (Requirements 6.1, 15.5). */
export interface AgentSessionEntry {
  sessionId: string;
  backendMode: 'headless' | 'ui';
  launchTimestamp: number;
  debugSession?: vscode.DebugSession;
}
