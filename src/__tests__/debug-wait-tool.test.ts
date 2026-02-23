/**
 * Unit tests for DebugWaitTool (VS Code LM Tool wrapper).
 *
 * Tests:
 * - No-session returns SESSION_NOT_STARTED (Req 6.1)
 * - Default timeout is 30000ms when omitted (Req 4.2)
 * - Already-cancelled token returns immediately (Req 5.3)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { DebugWaitTool } from '../lm-tools.js';
import type { SessionFactory } from '../session-factory.js';
import { SessionState } from 'ts-php-debug-mcp/session.js';

// Mock handleDebugWait to capture arguments and return a controlled result
const mockHandleDebugWait = vi.fn();
vi.mock('ts-php-debug-mcp/tools/debug-wait.js', () => ({
  handleDebugWait: (...args: any[]) => mockHandleDebugWait(...args),
}));

// --- Helpers ---

function makeSessionFactory(overrides: Partial<SessionFactory> = {}): SessionFactory {
  return {
    session: null,
    backend: null,
    breakpointLedger: null,
    launch: vi.fn(),
    terminate: vi.fn(),
    buildConfig: vi.fn(),
    resolveDebugAdapterPath: vi.fn(),
    ...overrides,
  } as any;
}

function makeMockSession() {
  return {
    state: SessionState.Connected,
    status: { state: 'connected', adapterAlive: true, pendingEventCount: 0 },
    dapClient: {
      onEvent: vi.fn(),
      offEvent: vi.fn(),
    },
  } as any;
}

function parseToolResult(result: vscode.LanguageModelToolResult): any {
  const part = result.parts[0] as vscode.LanguageModelTextPart;
  return JSON.parse(part.value);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHandleDebugWait.mockResolvedValue({
    success: true,
    data: { reason: 'event', event: 'stopped', body: {}, status: { state: 'paused' } },
  });
});

// --- Tests ---

describe('DebugWaitTool', () => {
  it('returns SESSION_NOT_STARTED when no session exists (Req 6.1)', async () => {
    const sf = makeSessionFactory({ session: null });
    const tool = new DebugWaitTool(sf);
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any;

    const result = await tool.invoke({ input: {} } as any, token);
    const parsed = parseToolResult(result);

    expect(parsed.code).toBe('SESSION_NOT_STARTED');
    expect(parsed.message).toContain('debug_launch');
    expect(mockHandleDebugWait).not.toHaveBeenCalled();
  });

  it('passes default timeout of 30000ms when omitted (Req 4.2)', async () => {
    const session = makeMockSession();
    const sf = makeSessionFactory({ session });
    const tool = new DebugWaitTool(sf);
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any;

    await tool.invoke({ input: {} } as any, token);

    expect(mockHandleDebugWait).toHaveBeenCalledOnce();
    const [, options] = mockHandleDebugWait.mock.calls[0];
    expect(options.timeout).toBe(30000);
  });

  it('passes custom timeout when provided', async () => {
    const session = makeMockSession();
    const sf = makeSessionFactory({ session });
    const tool = new DebugWaitTool(sf);
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any;

    await tool.invoke({ input: { timeout: 5000 } } as any, token);

    const [, options] = mockHandleDebugWait.mock.calls[0];
    expect(options.timeout).toBe(5000);
  });

  it('returns cancelled immediately when token is already cancelled (Req 5.3)', async () => {
    const session = makeMockSession();
    const sf = makeSessionFactory({ session });
    const tool = new DebugWaitTool(sf);

    // Mock handleDebugWait to return cancelled when signal.aborted is true
    mockHandleDebugWait.mockImplementation(async (_session: any, options: any) => {
      if (options.signal?.aborted) {
        return {
          success: true,
          data: { reason: 'cancelled', event: null, body: null, status: session.status },
        };
      }
      return { success: true, data: { reason: 'event', event: 'stopped', body: {}, status: session.status } };
    });

    const token = { isCancellationRequested: true, onCancellationRequested: vi.fn() } as any;

    await tool.invoke({ input: {} } as any, token);

    // Verify the signal adapter correctly reflects the token's cancelled state
    const [, options] = mockHandleDebugWait.mock.calls[0];
    expect(options.signal.aborted).toBe(true);
  });

  it('adapts CancellationToken to signal interface', async () => {
    const session = makeMockSession();
    const sf = makeSessionFactory({ session });
    const tool = new DebugWaitTool(sf);

    const onCancelCb = vi.fn();
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn((cb: () => void) => { onCancelCb.mockImplementation(cb); }),
    } as any;

    await tool.invoke({ input: {} } as any, token);

    const [, options] = mockHandleDebugWait.mock.calls[0];
    expect(options.signal.aborted).toBe(false);
    expect(typeof options.signal.onAbort).toBe('function');
  });
});
