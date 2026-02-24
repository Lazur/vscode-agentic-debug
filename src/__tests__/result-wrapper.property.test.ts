/**
 * Property-based tests for wrapToolResult.
 * Property 1: ToolResult wrapping preserves content.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { LanguageModelTextPart } from '../__mocks__/vscode.js';
import { wrapToolResult } from '../result-wrapper.js';

// --- Generators ---

const arbJsonPrimitive = fc.oneof(
  fc.string({ maxLength: 50 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Object.is(n, -0)),
  fc.boolean(),
  fc.constant(null),
);

const arbData = fc.oneof(
  arbJsonPrimitive,
  fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), arbJsonPrimitive, { minKeys: 0, maxKeys: 5 }),
  fc.array(arbJsonPrimitive, { maxLength: 5 }),
);

const arbSuccessResult = arbData.map((data) => ({
  success: true as const,
  data,
}));

const arbErrorResult = fc.record({
  message: fc.string({ minLength: 1, maxLength: 80 }),
  code: fc.stringMatching(/^[A-Z_]{3,30}$/),
}).map((error) => ({
  success: false as const,
  error,
}));

const arbToolResult = fc.oneof(arbSuccessResult, arbErrorResult);

describe('Feature: vscode-agentic-debug, Property 1: ToolResult wrapping preserves content', () => {
  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * For any ToolResult (success or error), wrapping it via wrapToolResult()
   * and then parsing the JSON text from the resulting LanguageModelTextPart
   * SHALL produce an object equal to the original ToolResult.data (if success)
   * or ToolResult.error (if error).
   */
  it('round-trips ToolResult content through JSON serialization', () => {
    fc.assert(
      fc.property(arbToolResult, (result) => {
        const wrapped = wrapToolResult(result);
        const part = wrapped.parts[0] as InstanceType<typeof LanguageModelTextPart>;
        const parsed = JSON.parse(part.value);

        const expected = result.success ? result.data : result.error;
        expect(parsed).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
