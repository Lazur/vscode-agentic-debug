"use strict";
/**
 * Mock of the VS Code API for testing outside the extension host.
 * Covers OutputChannel, StatusBarItem, debug namespace, and other types
 * needed by VsCodeNotificationSender, VsCodeDebugBackend, and LM Tool tests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Disposable = exports.extensions = exports.lm = exports.workspace = exports.debug = exports.window = exports.LanguageModelToolResult = exports.LanguageModelTextPart = exports.MarkdownString = exports.Uri = exports.StatusBarAlignment = void 0;
exports.__resetMocks = __resetMocks;
exports.createMockOutputChannel = createMockOutputChannel;
exports.createMockStatusBarItem = createMockStatusBarItem;
const vitest_1 = require("vitest");
function createMockEvent() {
    const listeners = [];
    const event = (listener) => {
        listeners.push(listener);
        return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0)
                listeners.splice(i, 1); } };
    };
    event.fire = (...args) => { for (const l of listeners)
        l(...args); };
    event.listeners = listeners;
    return event;
}
// --- Enums ---
var StatusBarAlignment;
(function (StatusBarAlignment) {
    StatusBarAlignment[StatusBarAlignment["Left"] = 1] = "Left";
    StatusBarAlignment[StatusBarAlignment["Right"] = 2] = "Right";
})(StatusBarAlignment || (exports.StatusBarAlignment = StatusBarAlignment = {}));
// --- Core classes ---
class Uri {
    scheme;
    path;
    constructor(scheme, path) {
        this.scheme = scheme;
        this.path = path;
    }
    get fsPath() { return this.path; }
    static file(path) { return new Uri('file', path); }
    static parse(value) { return new Uri('file', value); }
}
exports.Uri = Uri;
class MarkdownString {
    value;
    constructor(value = '') {
        this.value = value;
    }
}
exports.MarkdownString = MarkdownString;
// --- LanguageModelTextPart / LanguageModelToolResult ---
class LanguageModelTextPart {
    value;
    constructor(value) {
        this.value = value;
    }
}
exports.LanguageModelTextPart = LanguageModelTextPart;
class LanguageModelToolResult {
    parts;
    constructor(parts) {
        this.parts = parts;
    }
}
exports.LanguageModelToolResult = LanguageModelToolResult;
// --- vscode.window namespace ---
exports.window = {
    createOutputChannel: vitest_1.vi.fn(() => createMockOutputChannel()),
    createStatusBarItem: vitest_1.vi.fn(() => createMockStatusBarItem()),
};
// --- vscode.debug namespace ---
const onDidStartDebugSession = createMockEvent();
const onDidTerminateDebugSession = createMockEvent();
const onDidReceiveDebugSessionCustomEvent = createMockEvent();
exports.debug = {
    startDebugging: vitest_1.vi.fn().mockResolvedValue(true),
    stopDebugging: vitest_1.vi.fn().mockResolvedValue(undefined),
    registerDebugConfigurationProvider: vitest_1.vi.fn().mockReturnValue({ dispose: vitest_1.vi.fn() }),
    onDidStartDebugSession,
    onDidTerminateDebugSession,
    onDidReceiveDebugSessionCustomEvent,
};
// --- vscode.workspace namespace ---
exports.workspace = {
    getConfiguration: vitest_1.vi.fn().mockReturnValue({
        get: vitest_1.vi.fn(),
    }),
};
// --- vscode.lm namespace ---
exports.lm = {
    registerTool: vitest_1.vi.fn().mockReturnValue({ dispose: vitest_1.vi.fn() }),
};
// --- vscode.extensions namespace ---
exports.extensions = {
    getExtension: vitest_1.vi.fn(),
};
// --- Disposable ---
class Disposable {
    callOnDispose;
    constructor(callOnDispose) {
        this.callOnDispose = callOnDispose;
    }
    dispose() { this.callOnDispose(); }
}
exports.Disposable = Disposable;
// --- Reset helper for tests ---
function __resetMocks() {
    exports.debug.startDebugging.mockReset().mockResolvedValue(true);
    exports.debug.stopDebugging.mockReset().mockResolvedValue(undefined);
    exports.debug.registerDebugConfigurationProvider.mockReset().mockReturnValue({ dispose: vitest_1.vi.fn() });
    exports.debug.onDidStartDebugSession.listeners.length = 0;
    exports.debug.onDidTerminateDebugSession.listeners.length = 0;
    exports.debug.onDidReceiveDebugSessionCustomEvent.listeners.length = 0;
    exports.lm.registerTool.mockReset().mockReturnValue({ dispose: vitest_1.vi.fn() });
    exports.extensions.getExtension.mockReset();
}
// --- Mock factories ---
function createMockOutputChannel() {
    const lines = [];
    return {
        appendLine: vitest_1.vi.fn((line) => { lines.push(line); }),
        append: vitest_1.vi.fn(),
        clear: vitest_1.vi.fn(),
        show: vitest_1.vi.fn(),
        hide: vitest_1.vi.fn(),
        dispose: vitest_1.vi.fn(),
        _lines: lines,
    };
}
function createMockStatusBarItem() {
    return {
        text: '',
        tooltip: '',
        command: undefined,
        alignment: StatusBarAlignment.Left,
        priority: 0,
        show: vitest_1.vi.fn(),
        hide: vitest_1.vi.fn(),
        dispose: vitest_1.vi.fn(),
    };
}
//# sourceMappingURL=vscode.js.map