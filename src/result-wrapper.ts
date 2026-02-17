import * as vscode from 'vscode';
import type { ToolResult } from 'ts-php-debug-mcp/tools/types.js';

/**
 * Wrap a ToolResult into a LanguageModelToolResult.
 * Serializes `result.data` (success) or `result.error` (error) as JSON
 * into a LanguageModelTextPart. (Requirements 3.2, 3.3)
 */
export function wrapToolResult(result: ToolResult): vscode.LanguageModelToolResult {
  const payload = result.success ? result.data : result.error;
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2)),
  ]);
}

/**
 * Return a ToolResult indicating no active debug session.
 * Used by LM Tool wrappers when sessionFactory.session is null.
 * (Requirement 2.11)
 */
export function noSessionResult(): ToolResult {
  return {
    success: false,
    error: {
      message: 'No active debug session. Call debug_launch first.',
      code: 'SESSION_NOT_STARTED',
    },
  };
}

