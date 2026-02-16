# vscode-agentic-debug

VS Code extension that exposes PHP/Xdebug debugging as native [Language Model Tools](https://code.visualstudio.com/api/extension-guides/language-model-tool), enabling Copilot agent mode to programmatically launch, control, and inspect debug sessions.

The extension is a thin adapter layer over the backend-agnostic tool handlers from [`ts-php-debug-mcp`](../ts-php-debug-mcp/). The existing MCP server remains fully operational for CLI and non-VS Code clients.

## Features

- 15 Language Model Tools registered via `vscode.lm.registerTool()`
- Two backend modes: **UI** (native VS Code debug UI) and **headless** (direct DAP over stdio)
- Custom `php-agent` debug type that delegates to `xdebug.php-debug`
- Singleton session management via `SessionFactory`
- Three-tier config merge: tool params → VS Code settings → hardcoded defaults
- Breakpoint ledger tracking across both modes
- Graceful degradation when the LM Tools API is unavailable

## Prerequisites

- VS Code ≥ 1.95.0 (or compatible fork with `vscode.lm.registerTool` support)
- [PHP Debug](https://marketplace.visualstudio.com/items?itemName=xdebug.php-debug) extension (`xdebug.php-debug`)
- PHP with Xdebug 3 configured (`xdebug.mode=debug`, `xdebug.start_with_request=yes`)

## Installation

```bash
npm install
npm run build
```

To bundle for distribution:

```bash
npm run bundle
```

## Backend Modes

### UI mode (default)

Uses `VsCodeDebugBackend` which routes DAP operations through `vscode.debug` API. The developer sees pause lines, call stack, variable panels, and gutter breakpoints while the agent maintains programmatic control.

### Headless mode

Uses `DAPClient` which spawns `phpDebug.js` directly via stdio. No VS Code debug UI involvement — suited for automated/background debugging.

## Available Tools

| Tool | Description | Confirmation |
|------|-------------|:---:|
| `debug_launch` | Start a PHP debug session | ✓ |
| `debug_terminate` | End the current session | ✓ |
| `debug_status` | Get session state and guidance | — |
| `debug_continue` | Resume execution | — |
| `debug_next` | Step over | — |
| `debug_step_in` | Step into function call | — |
| `debug_step_out` | Step out of current function | — |
| `debug_pause` | Pause running execution | — |
| `debug_stack_trace` | Get call stack | — |
| `debug_scopes` | Get variable scopes for a frame | — |
| `debug_variables` | Inspect variables in a scope | — |
| `debug_evaluate` | Evaluate a PHP expression | — |
| `debug_threads` | List active threads | — |
| `debug_breakpoints` | Set breakpoints in a file | — |
| `debug_breakpoints_get` | Read current breakpoints for a file | — |

## Configuration

Settings are contributed under `agenticDebug.*` in VS Code:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agenticDebug.port` | number | `9003` | Xdebug listen port |
| `agenticDebug.hostname` | string | `127.0.0.1` | Listen hostname |
| `agenticDebug.stopOnEntry` | boolean | `true` | Pause on first line |
| `agenticDebug.pathMappings` | object | `{}` | Server → local path mappings |
| `agenticDebug.maxConnections` | number | `0` | Max Xdebug connections (0 = unlimited) |

Tool parameters passed to `debug_launch` override VS Code settings, which override hardcoded defaults.

## Architecture

```
Copilot Agent
    │
    ▼
15 LM Tool classes (lm-tools.ts)
    │
    ├──► SessionFactory (lifecycle, config, singleton)
    │       ├── SessionManager (from ts-php-debug-mcp)
    │       ├── BreakpointLedger
    │       └── PathMapper
    │
    ├──► handle* functions (from ts-php-debug-mcp)
    │
    └──► wrapToolResult → LanguageModelToolResult
              │
              ▼
         DebugBackend
         ├── VsCodeDebugBackend (UI mode → vscode.debug API)
         └── DAPClient (headless mode → phpDebug.js stdio)
```

## Development

```bash
npm test             # run tests (vitest)
npm run build        # compile TypeScript
npm run bundle       # bundle with esbuild
```

## License

MIT
