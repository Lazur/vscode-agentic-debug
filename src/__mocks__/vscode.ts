/**
 * Mock of the VS Code API for testing outside the extension host.
 * Covers OutputChannel, StatusBarItem, debug namespace, and other types
 * needed by VsCodeNotificationSender, VsCodeDebugBackend, and LM Tool tests.
 */

import { vi } from 'vitest';

// --- Helper: simple event emitter for mock event registrations ---

type Listener = (...args: any[]) => any;

function createMockEvent() {
  const listeners: Listener[] = [];
  const event = (listener: Listener) => {
    listeners.push(listener);
    return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); } };
  };
  event.fire = (...args: any[]) => { for (const l of listeners) l(...args); };
  event.listeners = listeners;
  return event;
}

// --- Enums ---

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

// --- Core classes ---

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly path: string,
  ) {}
  get fsPath(): string { return this.path; }
  static file(path: string): Uri { return new Uri('file', path); }
  static parse(value: string): Uri { return new Uri('file', value); }
}

export class MarkdownString {
  constructor(public value: string = '') {}
}

// --- LanguageModelTextPart / LanguageModelToolResult ---

export class LanguageModelTextPart {
  constructor(public readonly value: string) {}
}

export class LanguageModelToolResult {
  constructor(public readonly parts: LanguageModelTextPart[]) {}
}

// --- vscode.window namespace ---

export const window = {
  createOutputChannel: vi.fn(() => createMockOutputChannel()),
  createStatusBarItem: vi.fn(() => createMockStatusBarItem()),
};

// --- vscode.debug namespace ---

const onDidStartDebugSession = createMockEvent();
const onDidTerminateDebugSession = createMockEvent();
const onDidReceiveDebugSessionCustomEvent = createMockEvent();

export const debug = {
  startDebugging: vi.fn().mockResolvedValue(true),
  stopDebugging: vi.fn().mockResolvedValue(undefined),
  registerDebugConfigurationProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onDidStartDebugSession,
  onDidTerminateDebugSession,
  onDidReceiveDebugSessionCustomEvent,
};

// --- vscode.workspace namespace ---

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
  }),
};

// --- vscode.lm namespace ---

export const lm = {
  registerTool: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

// --- vscode.extensions namespace ---

export const extensions = {
  getExtension: vi.fn(),
};

// --- Disposable ---

export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose(): void { this.callOnDispose(); }
}

// --- Reset helper for tests ---

export function __resetMocks(): void {
  debug.startDebugging.mockReset().mockResolvedValue(true);
  debug.stopDebugging.mockReset().mockResolvedValue(undefined);
  debug.registerDebugConfigurationProvider.mockReset().mockReturnValue({ dispose: vi.fn() });
  (debug.onDidStartDebugSession as any).listeners.length = 0;
  (debug.onDidTerminateDebugSession as any).listeners.length = 0;
  (debug.onDidReceiveDebugSessionCustomEvent as any).listeners.length = 0;
  lm.registerTool.mockReset().mockReturnValue({ dispose: vi.fn() });
  extensions.getExtension.mockReset();
}

// --- Mock factories ---

export function createMockOutputChannel(): any {
  const lines: string[] = [];
  return {
    appendLine: vi.fn((line: string) => { lines.push(line); }),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    _lines: lines,
  };
}

export function createMockStatusBarItem(): any {
  return {
    text: '',
    tooltip: '',
    command: undefined as string | undefined,
    alignment: StatusBarAlignment.Left,
    priority: 0,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}
