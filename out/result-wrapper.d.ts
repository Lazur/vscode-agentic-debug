import * as vscode from 'vscode';
import type { ToolResult } from 'ts-php-debug-mcp/tools/types.js';
/**
 * Wrap a ToolResult into a LanguageModelToolResult.
 * Serializes `result.data` (success) or `result.error` (error) as JSON
 * into a LanguageModelTextPart. (Requirements 3.2, 3.3)
 */
export declare function wrapToolResult(result: ToolResult): vscode.LanguageModelToolResult;
