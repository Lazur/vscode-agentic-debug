/**
 * Mock of the VS Code API for testing outside the extension host.
 * Covers OutputChannel, StatusBarItem, debug namespace, and other types
 * needed by VsCodeNotificationSender, VsCodeDebugBackend, and LM Tool tests.
 */
type Listener = (...args: any[]) => any;
export declare enum StatusBarAlignment {
    Left = 1,
    Right = 2
}
export declare class Uri {
    readonly scheme: string;
    readonly path: string;
    private constructor();
    get fsPath(): string;
    static file(path: string): Uri;
    static parse(value: string): Uri;
}
export declare class MarkdownString {
    value: string;
    constructor(value?: string);
}
export declare class LanguageModelTextPart {
    readonly value: string;
    constructor(value: string);
}
export declare class LanguageModelToolResult {
    readonly parts: LanguageModelTextPart[];
    constructor(parts: LanguageModelTextPart[]);
}
export declare const window: {
    createOutputChannel: import("vitest").Mock<() => any>;
    createStatusBarItem: import("vitest").Mock<() => any>;
};
export declare const debug: {
    startDebugging: import("vitest").Mock<import("@vitest/spy", { with: { "resolution-mode": "import" } }).Procedure>;
    stopDebugging: import("vitest").Mock<import("@vitest/spy", { with: { "resolution-mode": "import" } }).Procedure>;
    registerDebugConfigurationProvider: import("vitest").Mock<import("@vitest/spy", { with: { "resolution-mode": "import" } }).Procedure>;
    onDidStartDebugSession: {
        (listener: Listener): {
            dispose: () => void;
        };
        fire(...args: any[]): void;
        listeners: Listener[];
    };
    onDidTerminateDebugSession: {
        (listener: Listener): {
            dispose: () => void;
        };
        fire(...args: any[]): void;
        listeners: Listener[];
    };
    onDidReceiveDebugSessionCustomEvent: {
        (listener: Listener): {
            dispose: () => void;
        };
        fire(...args: any[]): void;
        listeners: Listener[];
    };
};
export declare const workspace: {
    getConfiguration: import("vitest").Mock<import("@vitest/spy", { with: { "resolution-mode": "import" } }).Procedure>;
};
export declare const lm: {
    registerTool: import("vitest").Mock<import("@vitest/spy", { with: { "resolution-mode": "import" } }).Procedure>;
};
export declare const extensions: {
    getExtension: import("vitest").Mock<import("@vitest/spy", { with: { "resolution-mode": "import" } }).Procedure>;
};
export declare class Disposable {
    private callOnDispose;
    constructor(callOnDispose: () => void);
    dispose(): void;
}
export declare function __resetMocks(): void;
export declare function createMockOutputChannel(): any;
export declare function createMockStatusBarItem(): any;
export {};
