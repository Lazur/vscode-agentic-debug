/**
 * Property-based tests for SessionFactory.buildConfig().
 * Property 15: Config merge priority.
 *
 * **Validates: Requirements 18.1, 18.5, 6.3**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

import * as vscode from 'vscode';
import { SessionFactory } from '../session-factory.js';
import type { VsCodeNotificationSender } from '../notification-sender.js';
import { createMockOutputChannel } from '../__mocks__/vscode.js';
import type { LaunchInput } from '../types.js';

// --- Mock ts-php-debug-mcp modules (not exercised, but required for import) ---

vi.mock('ts-php-debug-mcp/session.js', () => ({
  SessionManager: vi.fn(),
}));
vi.mock('ts-php-debug-mcp/dap-client.js', () => ({
  DAPClient: vi.fn(),
}));
vi.mock('ts-php-debug-mcp/path-mapper.js', () => ({
  PathMapper: vi.fn(),
}));
vi.mock('ts-php-debug-mcp/breakpoint-ledger.js', () => ({
  BreakpointLedger: vi.fn(),
}));
vi.mock('ts-php-debug-mcp/tools/debug-launch.js', () => ({
  handleDebugLaunch: vi.fn(),
}));
vi.mock('ts-php-debug-mcp/tools/debug-terminate.js', () => ({
  handleDebugTerminate: vi.fn(),
}));
vi.mock('../vscode-debug-backend.js', () => ({
  VsCodeDebugBackend: vi.fn(),
}));

// --- Helpers ---

function createMockNotifier(): VsCodeNotificationSender {
  return {
    sendProgress: vi.fn(),
    sendLog: vi.fn(),
    sendDebugEvent: vi.fn(),
  } as unknown as VsCodeNotificationSender;
}

/**
 * Sets up the vscode.workspace.getConfiguration mock to return specific
 * values for agenticDebug.* settings. Keys not in the map return undefined.
 */
function mockVsCodeSettings(settingsMap: Record<string, unknown>): void {
  (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockReturnValue({
    get: vi.fn((key: string) => settingsMap[key]),
  });
}

// --- Generators ---

const arbPort = fc.integer({ min: 1024, max: 65535 });
const arbHostname = fc.string({ minLength: 1, maxLength: 15 });
const arbPathMappings = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.string({ minLength: 1, maxLength: 10 }),
  { minKeys: 0, maxKeys: 3 },
);

beforeEach(() => {
  (vscode as any).__resetMocks();
  // Always provide a valid extension path for resolveDebugAdapterPath
  (vscode.extensions.getExtension as any).mockReturnValue({
    extensionPath: '/mock/extensions/xdebug.php-debug',
  });
});

describe('Feature: vscode-agentic-debug, Property 15: Config merge priority', () => {
  /**
   * **Validates: Requirements 18.1, 18.5, 6.3**
   *
   * For any combination of tool parameters, VS Code workspace settings,
   * and hardcoded defaults, SessionFactory.buildConfig() SHALL produce a
   * Config where:
   * (a) tool parameters override VS Code settings and defaults,
   * (b) VS Code settings override defaults,
   * (c) hardcoded fields (runtimeExecutable, log, xdebugSettings) always
   *     use their hardcoded values regardless of other inputs,
   * (d) maxConnections defaults to 0.
   */

  it('tool parameters take highest priority over VS Code settings and defaults', () => {
    fc.assert(
      fc.property(
        arbPort,
        fc.boolean(),
        arbPathMappings,
        arbPort,
        fc.boolean(),
        arbPathMappings,
        (toolPort, toolStopOnEntry, toolPathMappings, vsPort, vsStopOnEntry, vsPathMappings) => {
          // Set up VS Code settings with different values
          mockVsCodeSettings({
            port: vsPort,
            stopOnEntry: vsStopOnEntry,
            pathMappings: vsPathMappings,
            hostname: 'vs-host',
            maxConnections: 5,
          });

          const outputChannel = createMockOutputChannel();
          const notifier = createMockNotifier();
          const factory = new SessionFactory(notifier, outputChannel);

          const params: LaunchInput = {
            port: toolPort,
            stopOnEntry: toolStopOnEntry,
            pathMappings: toolPathMappings,
          };

          const config = factory.buildConfig(params);

          // (a) Tool params override VS Code settings
          expect(config.port).toBe(toolPort);
          expect(config.stopOnEntry).toBe(toolStopOnEntry);
          expect(config.pathMappings).toEqual(toolPathMappings);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('VS Code settings override hardcoded defaults when tool params are absent', () => {
    fc.assert(
      fc.property(
        arbPort,
        arbHostname,
        fc.boolean(),
        arbPathMappings,
        fc.integer({ min: 0, max: 10 }),
        (vsPort, vsHostname, vsStopOnEntry, vsPathMappings, vsMaxConnections) => {
          mockVsCodeSettings({
            port: vsPort,
            hostname: vsHostname,
            stopOnEntry: vsStopOnEntry,
            pathMappings: vsPathMappings,
            maxConnections: vsMaxConnections,
          });

          const outputChannel = createMockOutputChannel();
          const notifier = createMockNotifier();
          const factory = new SessionFactory(notifier, outputChannel);

          // No tool params provided — VS Code settings should win
          const config = factory.buildConfig({});

          expect(config.port).toBe(vsPort);
          expect(config.hostname).toBe(vsHostname);
          expect(config.stopOnEntry).toBe(vsStopOnEntry);
          expect(config.pathMappings).toEqual(vsPathMappings);
          expect(config.maxConnections).toBe(vsMaxConnections);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('hardcoded defaults apply when both tool params and VS Code settings are absent', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // VS Code settings return undefined for everything
        mockVsCodeSettings({});

        const outputChannel = createMockOutputChannel();
        const notifier = createMockNotifier();
        const factory = new SessionFactory(notifier, outputChannel);

        const config = factory.buildConfig({});

        // Hardcoded defaults
        expect(config.port).toBe(9003);
        expect(config.hostname).toBe('127.0.0.1');
        expect(config.stopOnEntry).toBe(true);
        expect(config.pathMappings).toEqual({});
        expect(config.maxConnections).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('hardcoded fields always use hardcoded values regardless of inputs', () => {
    fc.assert(
      fc.property(
        arbPort,
        fc.boolean(),
        arbPathMappings,
        (toolPort, toolStopOnEntry, toolPathMappings) => {
          // Even if VS Code settings somehow had values for hardcoded fields,
          // they must remain at their hardcoded values
          mockVsCodeSettings({
            port: toolPort,
            stopOnEntry: toolStopOnEntry,
            pathMappings: toolPathMappings,
          });

          const outputChannel = createMockOutputChannel();
          const notifier = createMockNotifier();
          const factory = new SessionFactory(notifier, outputChannel);

          const config = factory.buildConfig({
            port: toolPort,
            stopOnEntry: toolStopOnEntry,
            pathMappings: toolPathMappings,
          });

          // (c) Hardcoded fields always use hardcoded values
          expect(config.runtimeExecutable).toBe('php');
          expect(config.log).toBe(false);
          expect(config.xdebugSettings).toEqual({});
        },
      ),
      { numRuns: 100 },
    );
  });

  it('maxConnections defaults to 0 when not provided', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // VS Code settings return undefined for maxConnections
        mockVsCodeSettings({});

        const outputChannel = createMockOutputChannel();
        const notifier = createMockNotifier();
        const factory = new SessionFactory(notifier, outputChannel);

        const config = factory.buildConfig({});

        // (d) maxConnections defaults to 0
        expect(config.maxConnections).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
