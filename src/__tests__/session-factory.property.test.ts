/**
 * Property-based tests for SessionFactory.
 * Property 8: Singleton session invariant with BreakpointLedger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

import * as vscode from 'vscode';
import { SessionFactory } from '../session-factory.js';
import type { VsCodeNotificationSender } from '../notification-sender.js';
import { createMockOutputChannel } from '../__mocks__/vscode.js';

// --- Mock ts-php-debug-mcp modules ---

// Track SessionManager instances to verify singleton invariant
const sessionInstances: Array<{ terminated: boolean }> = [];

vi.mock('ts-php-debug-mcp/session.js', () => {
  class MockSessionManager {
    terminated = false;
    launch = vi.fn().mockResolvedValue({
      state: 'listening',
      adapterAlive: true,
      pendingEventCount: 0,
    });
    terminate = vi.fn().mockImplementation(async function(this: MockSessionManager) {
      this.terminated = true;
    });
    sessionConfig = {
      port: 9003,
      hostname: '127.0.0.1',
      stopOnEntry: true,
      pathMappings: {},
      maxConnections: 0,
      runtimeExecutable: 'php',
      log: false,
      xdebugSettings: {},
      adapterPath: '/mock/phpDebug.js',
    };
    state = 'not_started';
    status = { state: 'not_started', adapterAlive: false, pendingEventCount: 0 };
    stopInfo = undefined;
    dapClient = { getStatus: () => ({ alive: true }) };

    constructor() {
      sessionInstances.push(this);
    }
  }
  return { SessionManager: MockSessionManager };
});

vi.mock('ts-php-debug-mcp/dap-client.js', () => {
  class MockDAPClient {
    initialize = vi.fn().mockResolvedValue({});
    launch = vi.fn().mockResolvedValue({});
    configurationDone = vi.fn().mockResolvedValue({});
    sendRequest = vi.fn().mockResolvedValue({});
    disconnect = vi.fn().mockResolvedValue(undefined);
    onEvent = vi.fn();
    onAnyEvent = vi.fn();
    waitForEvent = vi.fn().mockResolvedValue({});
    isAlive = vi.fn().mockReturnValue(true);
    getStatus = vi.fn().mockReturnValue({ alive: true });
    getSeq = vi.fn().mockReturnValue(1);
    onTrace = null;
    onStderr = null;
  }
  return { DAPClient: MockDAPClient };
});

vi.mock('ts-php-debug-mcp/path-mapper.js', () => {
  class MockPathMapper {
    toRemote = vi.fn((p: string) => p);
    toLocal = vi.fn((p: string) => p);
  }
  return { PathMapper: MockPathMapper };
});

vi.mock('ts-php-debug-mcp/breakpoint-ledger.js', () => {
  class MockBreakpointLedger {
    getForFile = vi.fn().mockReturnValue([]);
    getAll = vi.fn().mockReturnValue([]);
    syncToDAP = vi.fn().mockResolvedValue(undefined);
  }
  return { BreakpointLedger: MockBreakpointLedger };
});

vi.mock('ts-php-debug-mcp/tools/debug-launch.js', () => ({
  handleDebugLaunch: vi.fn().mockResolvedValue({
    success: true,
    data: { status: 'listening', port: 9003, message: 'Debug session launched' },
  }),
}));

vi.mock('ts-php-debug-mcp/tools/debug-terminate.js', () => ({
  handleDebugTerminate: vi.fn().mockResolvedValue({
    success: true,
    data: { status: 'terminated', message: 'Debug session terminated' },
  }),
}));

// Mock VsCodeDebugBackend (local module)
vi.mock('../vscode-debug-backend.js', () => {
  class MockVsCodeDebugBackend {
    initialize = vi.fn().mockResolvedValue({});
    launch = vi.fn().mockResolvedValue({});
    configurationDone = vi.fn().mockResolvedValue({});
    sendRequest = vi.fn().mockResolvedValue({});
    disconnect = vi.fn().mockResolvedValue(undefined);
    onEvent = vi.fn();
    onAnyEvent = vi.fn();
    waitForEvent = vi.fn().mockResolvedValue({});
    isAlive = vi.fn().mockReturnValue(true);
    getStatus = vi.fn().mockReturnValue({ alive: true });
    getSeq = vi.fn().mockReturnValue(1);
    onTrace = null;
    onStderr = null;
  }
  return { VsCodeDebugBackend: MockVsCodeDebugBackend };
});

// --- Helpers ---

function createMockNotifier(): VsCodeNotificationSender {
  return {
    sendProgress: vi.fn().mockResolvedValue(undefined),
    sendLog: vi.fn().mockResolvedValue(undefined),
    sendDebugEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as VsCodeNotificationSender;
}

// Generator for launch params
const arbLaunchInput = fc.record({
  port: fc.option(fc.integer({ min: 1024, max: 65535 }), { nil: undefined }),
  backendMode: fc.option(
    fc.constantFrom('headless' as const, 'ui' as const),
    { nil: undefined },
  ),
  stopOnEntry: fc.option(fc.boolean(), { nil: undefined }),
});

beforeEach(() => {
  (vscode as any).__resetMocks();
  sessionInstances.length = 0;

  // Mock extensions.getExtension to return a valid extension path
  (vscode.extensions.getExtension as any).mockReturnValue({
    extensionPath: '/mock/extensions/xdebug.php-debug',
  });
});

describe('Feature: vscode-agentic-debug, Property 8: Singleton session invariant with BreakpointLedger', () => {
  /**
   * **Validates: Requirements 6.4, 6.5, 6.6, 18.6**
   *
   * For any sequence of SessionFactory.launch() invocations, at most one
   * SessionManager instance SHALL be active at any time. After each launch,
   * the previous session (if any) SHALL have been terminated. Each launch
   * SHALL create a new BreakpointLedger instance owned by the SessionFactory.
   */

  it('at most one session is active after any sequence of launches', async () => {
    const { handleDebugTerminate } = await import('ts-php-debug-mcp/tools/debug-terminate.js');

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbLaunchInput, { minLength: 1, maxLength: 10 }),
        async (launchSequence) => {
          (vscode as any).__resetMocks();
          (vscode.extensions.getExtension as any).mockReturnValue({
            extensionPath: '/mock/extensions/xdebug.php-debug',
          });
          sessionInstances.length = 0;
          (handleDebugTerminate as ReturnType<typeof vi.fn>).mockClear();

          const outputChannel = createMockOutputChannel();
          const notifier = createMockNotifier();
          const factory = new SessionFactory(notifier, outputChannel);

          const previousSessions: unknown[] = [];

          for (const params of launchSequence) {
            const prevSession = factory.session;
            if (prevSession) previousSessions.push(prevSession);

            await factory.launch(params);

            // After each launch, exactly one session should be active
            expect(factory.session).not.toBeNull();
            expect(factory.backend).not.toBeNull();
            expect(factory.breakpointLedger).not.toBeNull();
          }

          // Total sessions created equals launch count
          expect(sessionInstances.length).toBe(launchSequence.length);

          // handleDebugTerminate was called once for each previous session
          // (launchSequence.length - 1 times, since the first launch has no prior session)
          const terminateCalls = (handleDebugTerminate as ReturnType<typeof vi.fn>).mock.calls;
          expect(terminateCalls.length).toBe(launchSequence.length - 1);

          // Each terminate call received the correct previous session
          for (let i = 0; i < previousSessions.length; i++) {
            expect(terminateCalls[i][0]).toBe(previousSessions[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('each launch creates a distinct BreakpointLedger instance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbLaunchInput, { minLength: 2, maxLength: 6 }),
        async (launchSequence) => {
          (vscode as any).__resetMocks();
          (vscode.extensions.getExtension as any).mockReturnValue({
            extensionPath: '/mock/extensions/xdebug.php-debug',
          });
          sessionInstances.length = 0;

          const outputChannel = createMockOutputChannel();
          const notifier = createMockNotifier();
          const factory = new SessionFactory(notifier, outputChannel);

          const ledgers: unknown[] = [];

          for (const params of launchSequence) {
            await factory.launch(params);
            ledgers.push(factory.breakpointLedger);
          }

          // All ledgers should be distinct objects
          const uniqueLedgers = new Set(ledgers);
          expect(uniqueLedgers.size).toBe(launchSequence.length);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('terminate nulls out session, backend, and breakpointLedger', async () => {
    await fc.assert(
      fc.asyncProperty(arbLaunchInput, async (params) => {
        (vscode as any).__resetMocks();
        (vscode.extensions.getExtension as any).mockReturnValue({
          extensionPath: '/mock/extensions/xdebug.php-debug',
        });
        sessionInstances.length = 0;

        const outputChannel = createMockOutputChannel();
        const notifier = createMockNotifier();
        const factory = new SessionFactory(notifier, outputChannel);

        await factory.launch(params);
        expect(factory.session).not.toBeNull();
        expect(factory.backend).not.toBeNull();
        expect(factory.breakpointLedger).not.toBeNull();

        await factory.terminate();
        expect(factory.session).toBeNull();
        expect(factory.backend).toBeNull();
        expect(factory.breakpointLedger).toBeNull();
      }),
      { numRuns: 100 },
    );
  }, 30000);
});
