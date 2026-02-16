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
