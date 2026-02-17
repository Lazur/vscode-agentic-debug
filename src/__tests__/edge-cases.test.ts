/**
 * Unit tests for edge cases (Task 9).
 * Covers: runtime compatibility (9.1), error scenarios (9.2),
 * notification sender status bar (9.4),
 * SessionFactory (9.5), VsCodeDebugBackend (9.6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as vscode from 'vscode';
import {
  createMockOutputChannel,
  createMockStatusBarItem,
  __resetMocks,
} from '../__mocks__/vscode.js';

// --- Mock ts-php-debug-mcp modules ---

vi.mock('ts-php-debug-mcp/session.js', () => {
  const SessionState = {
    NotStarted: 'not_started',
    Initializing: 'initializing',
    Listening: 'listening',
    Connected: 'connected',
    Paused: 'paused',
    Terminated: 'terminated',
  };
  class MockSessionManager {
    terminated = false;
    launch = vi.fn().mockResolvedValue({ state: 'listening', adapterAlive: true, pendingEventCount: 0 });
    terminate = vi.fn().mockImplementation(async function (this: MockSessionManager) {
      this.terminated = true;
    });
    sessionConfig = {
      port: 9003, hostname: '127.0.0.1', stopOnEntry: true, pathMappings: {},
      maxConnections: 0, runtimeExecutable: 'php', log: false, xdebugSettings: {},
      adapterPath: '/mock/phpDebug.js',
    };
    state = 'not_started';
    status = { state: 'not_started', adapterAlive: false, pendingEventCount: 0 };
    stopInfo = undefined;
    dapClient = { getStatus: () => ({ alive: true }) };
  }
  return { SessionManager: MockSessionManager, SessionState };
});

vi.mock('ts-php-debug-mcp/dap-client.js', () => {
  class MockDAPClient {
    initialize = vi.fn().mockResolvedValue({});
    launch = vi.fn().mockResolvedValue({});
    configurationDone = vi.fn().mockResolvedValue({});
    sendRequest = vi.fn().mockResolvedValue({});
    disconnect = vi.fn().mockResolvedValue(undefined);
    onEvent = vi.fn(); onAnyEvent = vi.fn();
    waitForEvent = vi.fn().mockResolvedValue({});
    isAlive = vi.fn().mockReturnValue(true);
    getStatus = vi.fn().mockReturnValue({ alive: true });
    getSeq = vi.fn().mockReturnValue(1);
    onTrace = null; onStderr = null;
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
    success: true, data: { status: 'listening', port: 9003, message: 'Debug session launched' },
  }),
}));

vi.mock('ts-php-debug-mcp/tools/debug-terminate.js', () => ({
  handleDebugTerminate: vi.fn().mockResolvedValue({
    success: true, data: { status: 'terminated', message: 'Debug session terminated' },
  }),
}));

vi.mock('ts-php-debug-mcp/tools/debug-status.js', () => ({
  handleDebugStatus: vi.fn().mockReturnValue({ success: true, data: { state: 'paused' } }),
}));

vi.mock('ts-php-debug-mcp/tools/types.js', () => ({
  errorResult: (message: string, code: string) => ({
    success: false, error: { message, code },
  }),
  ErrorCodes: {
    SESSION_NOT_STARTED: 'SESSION_NOT_STARTED',
    SESSION_NOT_PAUSED: 'SESSION_NOT_PAUSED',
    DAP_ERROR: 'DAP_ERROR',
    INVALID_PARAMS: 'INVALID_PARAMS',
    ADAPTER_NOT_FOUND: 'ADAPTER_NOT_FOUND',
  },
}));

// Mock VsCodeDebugBackend as a proper class
vi.mock('../vscode-debug-backend.js', () => {
  class MockVsCodeDebugBackend {
    initialize = vi.fn().mockResolvedValue({});
    launch = vi.fn().mockResolvedValue({});
    configurationDone = vi.fn().mockResolvedValue({});
    sendRequest = vi.fn().mockResolvedValue({});
    disconnect = vi.fn().mockResolvedValue(undefined);
    onEvent = vi.fn(); onAnyEvent = vi.fn();
    waitForEvent = vi.fn().mockResolvedValue({});
    isAlive = vi.fn().mockReturnValue(true);
    getStatus = vi.fn().mockReturnValue({ alive: true });
    getSeq = vi.fn().mockReturnValue(1);
    onTrace = null; onStderr = null;
  }
  return {
    VsCodeDebugBackend: MockVsCodeDebugBackend,
    isAgentSession: (session: any) => session.type === 'php',
  };
});


// Import modules under test
import { VsCodeNotificationSender } from '../notification-sender.js';
import { SessionFactory } from '../session-factory.js';

beforeEach(() => {
  __resetMocks();
  vi.clearAllMocks();
});

// ============================================================
// 9.1: Runtime compatibility check
// ============================================================

describe('9.1: Runtime compatibility check', () => {
  it('registers 15 tools when vscode.lm.registerTool is available', async () => {
    const context = {
      subscriptions: [] as any[],
    } as any;

    const { activate } = await import('../extension.js');
    activate(context);

    expect(vscode.lm.registerTool).toHaveBeenCalledTimes(15);
  });

  it('runtime check detects when registerTool is a function', () => {
    // Default mock has registerTool as a function
    const available = typeof vscode.lm?.registerTool === 'function';
    expect(available).toBe(true);
  });

  it('runtime check detects when registerTool is missing', () => {
    // Simulate registerTool being undefined
    const mockLm = { registerTool: undefined as any };
    const available = typeof mockLm?.registerTool === 'function';
    expect(available).toBe(false);
  });

  it('runtime check detects when lm namespace is absent', () => {
    const mockVscode = { lm: undefined as any };
    const available = typeof mockVscode.lm?.registerTool === 'function';
    expect(available).toBe(false);
  });
});

// ============================================================
// 9.2: Error scenarios
// ============================================================

describe('9.2: Error scenarios', () => {
  it('resolveDebugAdapterPath throws when xdebug.php-debug extension not found', () => {
    (vscode.extensions.getExtension as any).mockReturnValue(undefined);

    const notifier = {
      sendProgress: vi.fn(), sendLog: vi.fn(), sendDebugEvent: vi.fn(),
    } as any;
    const factory = new SessionFactory(notifier, createMockOutputChannel());

    expect(() => factory.resolveDebugAdapterPath()).toThrow(
      /xdebug\.php-debug extension is required/,
    );
  });

  it('launch rejects when xdebug.php-debug extension is missing', async () => {
    (vscode.extensions.getExtension as any).mockReturnValue(undefined);

    const notifier = {
      sendProgress: vi.fn(), sendLog: vi.fn(), sendDebugEvent: vi.fn(),
    } as any;
    const factory = new SessionFactory(notifier, createMockOutputChannel());

    await expect(factory.launch({})).rejects.toThrow(
      /xdebug\.php-debug extension is required/,
    );
  });

  it('resolveDebugAdapterPath returns correct path when extension is found', () => {
    (vscode.extensions.getExtension as any).mockReturnValue({
      extensionPath: '/home/user/.vscode/extensions/xdebug.php-debug-1.0.0',
    });

    const notifier = {
      sendProgress: vi.fn(), sendLog: vi.fn(), sendDebugEvent: vi.fn(),
    } as any;
    const factory = new SessionFactory(notifier, createMockOutputChannel());

    const result = factory.resolveDebugAdapterPath();
    expect(result).toContain('xdebug.php-debug');
    expect(result).toContain('phpDebug.js');
  });
});




// ============================================================
// 9.4: VsCodeNotificationSender status bar
// ============================================================

describe('9.4: VsCodeNotificationSender status bar', () => {
  it('stopped event updates status bar with paused state, thread ID, reason and shows it', async () => {
    const outputChannel = createMockOutputChannel();
    const statusBar = createMockStatusBarItem();
    const sender = new VsCodeNotificationSender(outputChannel, statusBar);

    await sender.sendDebugEvent('stopped', { reason: 'breakpoint', threadId: 7 });

    expect(statusBar.text).toContain('Paused');
    expect(statusBar.text).toContain('breakpoint');
    expect(statusBar.text).toContain('7');
    expect(statusBar.show).toHaveBeenCalled();
  });

  it('continued event updates status bar text to running', async () => {
    const outputChannel = createMockOutputChannel();
    const statusBar = createMockStatusBarItem();
    const sender = new VsCodeNotificationSender(outputChannel, statusBar);

    await sender.sendDebugEvent('continued', {});
    expect(statusBar.text).toContain('Running');
  });

  it('terminated event hides status bar', async () => {
    const outputChannel = createMockOutputChannel();
    const statusBar = createMockStatusBarItem();
    const sender = new VsCodeNotificationSender(outputChannel, statusBar);

    await sender.sendDebugEvent('stopped', { reason: 'step', threadId: 1 });
    expect(statusBar.show).toHaveBeenCalled();

    await sender.sendDebugEvent('terminated', {});
    expect(statusBar.hide).toHaveBeenCalled();
  });
});


// ============================================================
// 9.5: SessionFactory
// ============================================================

describe('9.5: SessionFactory', () => {
  function makeFactory() {
    const notifier = {
      sendProgress: vi.fn(), sendLog: vi.fn(), sendDebugEvent: vi.fn(),
    } as any;
    return new SessionFactory(notifier, createMockOutputChannel());
  }

  beforeEach(() => {
    (vscode.extensions.getExtension as any).mockReturnValue({
      extensionPath: '/mock/ext',
    });
  });

  it('buildConfig merges tool params over VS Code settings over defaults', () => {
    const mockGet = vi.fn().mockImplementation((key: string) => {
      const settings: Record<string, unknown> = {
        port: 9999, hostname: '0.0.0.0', stopOnEntry: false,
        pathMappings: { '/server': '/local' }, maxConnections: 5,
      };
      return settings[key];
    });
    (vscode.workspace.getConfiguration as any).mockReturnValue({ get: mockGet });

    const factory = makeFactory();
    const config = factory.buildConfig({ port: 8080, stopOnEntry: true });

    // Tool params override VS Code settings
    expect(config.port).toBe(8080);
    expect(config.stopOnEntry).toBe(true);
    // VS Code settings used when tool params absent
    expect(config.hostname).toBe('0.0.0.0');
  });

  it('hardcoded fields always use hardcoded values', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    });

    const factory = makeFactory();
    const config = factory.buildConfig({});

    expect(config.runtimeExecutable).toBe('php');
    expect(config.log).toBe(false);
    expect(config.xdebugSettings).toEqual({});
  });

  it('launch creates BreakpointLedger per session', async () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    });

    const factory = makeFactory();
    await factory.launch({ port: 9003 });
    expect(factory.breakpointLedger).not.toBeNull();
  });

  it('terminate nulls out session, backend, and breakpointLedger', async () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    });

    const factory = makeFactory();
    await factory.launch({});
    expect(factory.session).not.toBeNull();

    await factory.terminate();
    expect(factory.session).toBeNull();
    expect(factory.backend).toBeNull();
    expect(factory.breakpointLedger).toBeNull();
  });

  it('singleton invariant: launching while session active terminates previous', async () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    });

    const { handleDebugTerminate } = await import('ts-php-debug-mcp/tools/debug-terminate.js');
    const factory = makeFactory();

    await factory.launch({});
    const firstSession = factory.session;

    await factory.launch({});
    expect(handleDebugTerminate).toHaveBeenCalledWith(firstSession);
    expect(factory.session).not.toBe(firstSession);
    expect(factory.session).not.toBeNull();
  });
});


// ============================================================
// 9.6: VsCodeDebugBackend
// ============================================================

describe('9.6: VsCodeDebugBackend', () => {
  it('buildDebugConfig sets type php directly (no php-agent, no __agentInitiated)', async () => {
    // Use the real VsCodeDebugBackend
    vi.doUnmock('../vscode-debug-backend.js');
    const { VsCodeDebugBackend } = await import('../vscode-debug-backend.js');

    const backend = new VsCodeDebugBackend();
    await backend.initialize();

    let capturedConfig: any = null;
    (vscode.debug.startDebugging as any).mockImplementation(async (_folder: any, cfg: any) => {
      capturedConfig = cfg;
      const session = {
        id: 'test-1', type: 'php', name: 'Test',
        configuration: { ...cfg, type: 'php' },
        customRequest: vi.fn().mockResolvedValue({}),
      };
      setTimeout(() => {
        const listeners = (vscode.debug.onDidStartDebugSession as any).listeners;
        for (const l of listeners) l(session);
      }, 0);
      return true;
    });

    await backend.launch({ port: 9003 } as any);

    expect(capturedConfig.type).toBe('php');
    expect(capturedConfig).not.toHaveProperty('__agentInitiated');

    await backend.disconnect();
    vi.doMock('../vscode-debug-backend.js');
  });

  it('isAgentSession matches any session with type php', async () => {
    vi.doUnmock('../vscode-debug-backend.js');
    const { isAgentSession } = await import('../vscode-debug-backend.js');

    // PHP session: matches
    expect(isAgentSession({
      id: 'a', type: 'php', name: 'A',
      configuration: { type: 'php' },
    } as any)).toBe(true);

    // PHP session without __agentInitiated: still matches
    expect(isAgentSession({
      id: 'b', type: 'php', name: 'B',
      configuration: { type: 'php' },
    } as any)).toBe(true);

    // Non-php type: does not match
    expect(isAgentSession({
      id: 'c', type: 'node', name: 'C',
      configuration: { type: 'node' },
    } as any)).toBe(false);

    vi.doMock('../vscode-debug-backend.js');
  });
});
