/**
 * Property-based tests for VsCodeDebugBackend.
 * Property 8: VsCodeDebugBackend launches with type 'php'.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

import * as vscode from 'vscode';
import { VsCodeDebugBackend, isAgentSession } from '../vscode-debug-backend.js';

/** Create a mock debug session with the given type and configuration. */
function createMockSession(
  overrides: { id?: string; type?: string; configuration?: Record<string, unknown> } = {},
): vscode.DebugSession {
  return {
    id: overrides.id ?? 'test-session',
    type: overrides.type ?? 'php',
    name: 'Test Session',
    workspaceFolder: undefined,
    configuration: overrides.configuration ?? { type: 'php', name: 'Test', request: 'launch' },
    customRequest: vi.fn().mockResolvedValue({}),
    getDebugProtocolBreakpoint: vi.fn(),
    parentSession: undefined,
  } as unknown as vscode.DebugSession;
}

beforeEach(() => {
  (vscode as any).__resetMocks();
});

describe('Property 8: VsCodeDebugBackend launches with type php', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   *
   * For any debug session started via VsCodeDebugBackend.launch(),
   * the launch configuration SHALL have type: 'php' directly.
   * It SHALL NOT contain php-agent, __agentInitiated, backendMode, or agentSessionId.
   * isAgentSession SHALL return true for any session with type === 'php'.
   */

  it('buildDebugConfig always sets type=php with no forbidden fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          port: fc.integer({ min: 1024, max: 65535 }),
          stopOnEntry: fc.boolean(),
          hostname: fc.stringMatching(/^[a-z0-9.]{1,15}$/),
        }),
        async (config) => {
          (vscode as any).__resetMocks();

          const backend = new VsCodeDebugBackend();
          await backend.initialize();

          let capturedConfig: any = null;
          (vscode.debug.startDebugging as any).mockImplementation(async (_folder: any, cfg: any) => {
            capturedConfig = cfg;
            const session = createMockSession({
              type: 'php',
              configuration: { ...cfg, type: 'php' },
            });
            setTimeout(() => {
              const listeners = (vscode.debug.onDidStartDebugSession as any).listeners;
              for (const l of listeners) l(session);
            }, 0);
            return true;
          });

          await backend.launch(config as any);

          // Must use type 'php' directly (Requirement 6.1)
          expect(capturedConfig.type).toBe('php');
          // Must NOT contain forbidden fields (Requirements 6.3, 6.4)
          expect(capturedConfig).not.toHaveProperty('__agentInitiated');
          expect(capturedConfig).not.toHaveProperty('backendMode');
          expect(capturedConfig).not.toHaveProperty('agentSessionId');

          await backend.disconnect();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('isAgentSession returns true for any php session (Requirement 6.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('php', 'node', 'python', 'java', 'go'),
        (sessionType) => {
          const session = createMockSession({
            type: sessionType,
            configuration: {
              type: sessionType,
              name: 'Test',
              request: 'launch',
            },
          });

          const result = isAgentSession(session);

          // Should be true when type is 'php', false otherwise
          expect(result).toBe(sessionType === 'php');
        },
      ),
      { numRuns: 100 },
    );
  });
});
