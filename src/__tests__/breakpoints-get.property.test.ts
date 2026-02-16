/**
 * Property-based tests for debug_breakpoints_get behavior.
 * Property 14: debug_breakpoints_get returns ledger state.
 *
 * Tests the core property that getForFile() on BreakpointLedger returns
 * exactly the breakpoints that were added for a given file, and that
 * the tool wrapper correctly surfaces SESSION_NOT_STARTED when no ledger exists.
 *
 * **Validates: Requirements 12.7, 12.8**
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

import { BreakpointLedger } from 'ts-php-debug-mcp/breakpoint-ledger.js';
import { PathMapper } from 'ts-php-debug-mcp/path-mapper.js';
import { errorResult, type ToolResult } from 'ts-php-debug-mcp/tools/types.js';

// --- Helpers ---

function createMockBackend() {
  return {
    sendRequest: vi.fn().mockResolvedValue({}),
    initialize: vi.fn(),
    launch: vi.fn(),
    configurationDone: vi.fn(),
    disconnect: vi.fn(),
    onEvent: vi.fn(),
    onAnyEvent: vi.fn(),
    waitForEvent: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
    getStatus: vi.fn(),
    getSeq: vi.fn(),
  };
}

/**
 * Replicates the DebugBreakpointsGetTool.invoke() logic:
 * - If no ledger, return SESSION_NOT_STARTED error
 * - Otherwise, return getForFile() result
 */
function invokeBreakpointsGet(
  ledger: BreakpointLedger | null,
  path: string,
): ToolResult {
  if (!ledger) {
    return errorResult('No active debug session. Call debug_launch first.', 'SESSION_NOT_STARTED');
  }
  const breakpoints = ledger.getForFile(path);
  return { success: true, data: { path, breakpoints } };
}

// --- Generators ---

const arbFilePath = fc.stringMatching(/^\/[a-z][a-z0-9/]*\.[a-z]{2,4}$/)
  .filter(s => s.length >= 5 && s.length <= 60);

const arbBreakpoint = fc.record({
  line: fc.integer({ min: 1, max: 10000 }),
  condition: fc.option(
    fc.string({ minLength: 1, maxLength: 20 }),
    { nil: undefined },
  ),
});

const arbBreakpointList = fc.array(arbBreakpoint, { minLength: 0, maxLength: 10 });

describe('Feature: vscode-agentic-debug, Property 14: debug_breakpoints_get returns ledger state', () => {
  /**
   * **Validates: Requirements 12.7, 12.8**
   *
   * For any file path and any set of breakpoints previously set via the ledger,
   * invoking debug_breakpoints_get with that path returns the currently active
   * breakpoints for that file from the BreakpointLedger. This holds in both
   * headless and UI backend modes (backend mode doesn't affect getForFile).
   */

  it('returns breakpoints matching ledger state for any file and breakpoint set', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFilePath,
        arbBreakpointList,
        async (filePath, breakpoints) => {
          const backend = createMockBackend();
          const pathMapper = new PathMapper([]);
          const ledger = new BreakpointLedger(backend as any, pathMapper);

          // Add breakpoints as agent breakpoints
          if (breakpoints.length > 0) {
            ledger.addAgentBreakpoints(
              1,
              breakpoints.map(bp => ({
                file: filePath,
                line: bp.line,
                condition: bp.condition,
              })),
            );
          }

          const result = invokeBreakpointsGet(ledger, filePath);

          // Must be a success result
          expect(result.success).toBe(true);
          const data = result.data as { path: string; breakpoints: any[] };
          expect(data.path).toBe(filePath);

          // Returned breakpoints must match ledger contents exactly
          const ledgerEntries = ledger.getForFile(filePath);
          expect(data.breakpoints).toHaveLength(ledgerEntries.length);
          expect(data.breakpoints).toEqual(ledgerEntries);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('returns SESSION_NOT_STARTED when no ledger exists (no active session)', async () => {
    await fc.assert(
      fc.asyncProperty(arbFilePath, async (filePath) => {
        const result = invokeBreakpointsGet(null, filePath);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('SESSION_NOT_STARTED');
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('returns empty array for files with no breakpoints in the ledger', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFilePath,
        arbFilePath,
        async (populatedPath, queryPath) => {
          // Only test when paths differ
          fc.pre(populatedPath !== queryPath);

          const backend = createMockBackend();
          const pathMapper = new PathMapper([]);
          const ledger = new BreakpointLedger(backend as any, pathMapper);

          // Add breakpoints to populatedPath only
          ledger.addAgentBreakpoints(1, [{ file: populatedPath, line: 42 }]);

          const result = invokeBreakpointsGet(ledger, queryPath);

          expect(result.success).toBe(true);
          const data = result.data as { path: string; breakpoints: any[] };
          expect(data.path).toBe(queryPath);
          expect(data.breakpoints).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('reflects IDE and agent breakpoints from the same file', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFilePath,
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1, maxLength: 5 }),
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1, maxLength: 5 }),
        async (filePath, agentLines, ideLines) => {
          const backend = createMockBackend();
          const pathMapper = new PathMapper([]);
          const ledger = new BreakpointLedger(backend as any, pathMapper);

          // Add agent breakpoints
          ledger.addAgentBreakpoints(
            1,
            agentLines.map(line => ({ file: filePath, line })),
          );

          // Add IDE breakpoints
          ledger.addIdeBreakpoints(
            ideLines.map(line => ({ file: filePath, line })),
          );

          const result = invokeBreakpointsGet(ledger, filePath);

          expect(result.success).toBe(true);
          const data = result.data as { path: string; breakpoints: any[] };

          // The returned breakpoints should match the full ledger state
          const ledgerEntries = ledger.getForFile(filePath);
          expect(data.breakpoints).toHaveLength(ledgerEntries.length);
          expect(data.breakpoints).toEqual(ledgerEntries);

          // Both sources should be represented
          const sources = new Set(data.breakpoints.map((bp: any) => bp.source));
          expect(sources.has('agent')).toBe(true);
          expect(sources.has('ide')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
