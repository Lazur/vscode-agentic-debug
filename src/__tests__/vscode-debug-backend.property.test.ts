/**
 * Property-based tests for VsCodeDebugBackend.
 * Property 16: Agent session identification.
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
    configuration: overrides.configuration ?? { type: 'php', name: 'Test', request: 'launch', __agentInitiated: true },
    customRequest: vi.fn().mockResolvedValue({}),
    getDebugProtocolBreakpoint: vi.fn(),
    parentSession: undefined,
  } as unknown as vscode.DebugSession;
}

beforeEach(() => {
  (vscode as any).__resetMocks();
});

describe('Feature: vscode-agentic-debug, Property 16: Agent session identification', () => {
  /**
   * **Validates: Requirements 15.3**
   *
   * For any debug session started via VsCodeDebugBackend.launch(),
   * the launch configuration SHALL include __agentInitiated: true and type: 'php-agent'.
   * The isAgentSession filter SHALL return true only for sessions where
   * session.type === 'php' AND configuration.__agentInitiated === true.
   */

  it('buildDebugConfig always sets type=php-agent and __agentInitiated=true', async () => {
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

          // Mock startDebugging to capture the config and fire session start
          let capturedConfig: any = null;
          (vscode.debug.startDebugging as any).mockImplementation(async (_folder: any, cfg: any) => {
            capturedConfig = cfg;
            // Simulate the config provider transforming php-agent → php
            const session = createMockSession({
              type: 'php',
              configuration: { ...cfg, type: 'php', __agentInitiated: true },
            });
            setTimeout(() => {
              const listeners = (vscode.debug.onDidStartDebugSession as any).listeners;
              for (const l of listeners) l(session);
            }, 0);
            return true;
          });

          await backend.launch(config as any);

          // The config passed to startDebugging must have type 'php-agent' and __agentInitiated
          expect(capturedConfig.type).toBe('php-agent');
          expect(capturedConfig.__agentInitiated).toBe(true);

          await backend.disconnect();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('isAgentSession returns true only for php type with __agentInitiated marker', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('php', 'node', 'python', 'java', 'php-agent', 'go'),
        fc.boolean(),
        (sessionType, hasMarker) => {
          const session = createMockSession({
            type: sessionType,
            configuration: {
              type: sessionType,
              name: 'Test',
              request: 'launch',
              ...(hasMarker ? { __agentInitiated: true } : {}),
            },
          });

          const result = isAgentSession(session);

          // Should only be true when type is 'php' AND __agentInitiated is true
          expect(result).toBe(sessionType === 'php' && hasMarker);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('agent sessions are tracked in the Map on start and removed on terminate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        async (sessionIds) => {
          (vscode as any).__resetMocks();

          const backend = new VsCodeDebugBackend();
          await backend.initialize();

          // Start sessions
          for (const id of sessionIds) {
            const session = createMockSession({
              id,
              type: 'php',
              configuration: { type: 'php', name: 'Test', request: 'launch', __agentInitiated: true },
            });
            const listeners = (vscode.debug.onDidStartDebugSession as any).listeners;
            for (const l of listeners) l(session);
          }

          // All agent sessions should be tracked
          const tracked = backend.getAgentSessions();
          for (const id of sessionIds) {
            expect(tracked.has(id)).toBe(true);
            expect(tracked.get(id)!.backendMode).toBe('ui');
          }

          // Terminate sessions
          for (const id of sessionIds) {
            const session = createMockSession({
              id,
              type: 'php',
              configuration: { type: 'php', name: 'Test', request: 'launch', __agentInitiated: true },
            });
            const listeners = (vscode.debug.onDidTerminateDebugSession as any).listeners;
            for (const l of listeners) l(session);
          }

          // All should be removed
          expect(backend.getAgentSessions().size).toBe(0);

          await backend.disconnect();
        },
      ),
      { numRuns: 100 },
    );
  });
});
