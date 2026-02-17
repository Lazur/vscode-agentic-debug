# vscode-agentic-debug

VS Code extension that exposes PHP/Xdebug debugging as native [Language Model Tools](https://code.visualstudio.com/api/extension-guides/language-model-tool), enabling Copilot agent mode to programmatically launch, control, and inspect debug sessions.

The extension is a thin adapter layer over the backend-agnostic tool handlers from `ts-php-debug-mcp`. The existing MCP server remains fully operational for CLI and non-VS Code clients.

## Features

- 15 Language Model Tools registered via `vscode.lm.registerTool()`
- Two backend modes: **UI** (native VS Code debug UI) and **headless** (direct DAP over stdio)
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

## Installing in VS Code

Since this extension isn't published to the marketplace yet, install it locally:

### Option A: Symlink into extensions folder

```bash
# Build the extension
cd vscode-agentic-debug
npm install
npm run bundle

# Symlink into VS Code extensions directory
ln -s "$(pwd)" ~/.vscode/extensions/vscode-agentic-debug
```

Restart VS Code. The extension activates when Copilot invokes `debug_launch`.

### Option B: Package as VSIX

Requires [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce):

```bash
npm install -g @vscode/vsce
cd vscode-agentic-debug
npm run bundle
vsce package
```

Then install the `.vsix` file:

```bash
code --install-extension vscode-agentic-debug-0.1.0.vsix
```

Or in VS Code: Extensions panel → `...` menu → "Install from VSIX..."

### Option C: Development host (for debugging the extension itself)

1. Open the `vscode-agentic-debug` folder in VS Code
2. Press `F5` to launch an Extension Development Host
3. The extension loads in the new window with full debugging support

### Verify installation

After installing, open the Output panel (`View → Output`) and select "Agentic Debug" from the dropdown. You should see tool registration logs when the extension activates. If `vscode.lm.registerTool` isn't available in your VS Code version, you'll see a warning — the extension still activates but without LM tools.

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

## How the Agent Launches a Session

When Copilot (or any LM agent) calls `debug_launch`, it passes a flat JSON object with these parameters:

```json
{
  "port": 9003,
  "backendMode": "ui",
  "pathMappings": { "/var/www/html": "/Users/me/project" },
  "stopOnEntry": true,
  "hostname": "127.0.0.1",
  "log": false
}
```

All fields are optional. Here's what each one does:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `port` | number | `9003` (or from settings) | Xdebug listen port |
| `backendMode` | `"ui"` \| `"headless"` | `"ui"` | Which debug backend to use (see below) |
| `pathMappings` | object | `{}` (falls back to settings → launch.json) | Server-to-local path mappings for Docker/remote |
| `stopOnEntry` | boolean | `true` (or from settings) | Pause on the first line when Xdebug connects |
| `hostname` | string | `"127.0.0.1"` (or from settings) | Hostname to listen on |
| `log` | boolean | `false` | Enable xdebug.php-debug adapter logging |

### Backend modes

The `backendMode` parameter controls how the debug session runs:

- **`"ui"` (default, recommended)** — Uses `VsCodeDebugBackend`, which calls `vscode.debug.startDebugging()` with `type: 'php'`. The developer sees the full VS Code debug UI: pause indicators, call stack panel, variable inspector, gutter breakpoints. The agent still has full programmatic control via the other tools. Use this for all interactive debugging — stepping, variable inspection, breakpoints all work reliably.

- **`"headless"`** — Uses `DAPClient`, which spawns `phpDebug.js` directly over stdio. No VS Code debug UI is shown. Limited interactive capabilities: thread listing and variable inspection may not work reliably due to Xdebug's per-request connection lifecycle. Only use for automated/batch scenarios where no human interaction is needed.

### pathMappings resolution

When the agent calls `debug_launch`, pathMappings are resolved through a fallback chain:

1. **Tool parameters** — `pathMappings` passed directly in the `debug_launch` call (highest priority)
2. **VS Code settings** — `agenticDebug.pathMappings` from workspace/user settings
3. **launch.json** — First PHP config (`type: "php"`) with non-empty `pathMappings` found in `.vscode/launch.json`
4. **Empty `{}`** — No mapping (works for local-only debugging, breaks Docker/remote setups)

Empty objects (`{}`) are treated the same as `undefined` at each tier, so the chain falls through correctly when the agent sends `pathMappings: {}`.

### Input format

Parameters must be flat top-level properties. The agent should NOT wrap them in a `configuration` object:

```
✓ Correct:   { "port": 9003, "pathMappings": { "/var/www/html": "/local" } }
✗ Incorrect: { "configuration": { "port": 9003, "pathMappings": { ... } } }
```

The extension includes a defensive unwrap for the nested format, but the correct format is flat.

## Example: Prompting the Agent to Debug

Here's a prompt you can paste into Copilot agent chat to have it plan and execute a debug session using the tools:

```
I have a bug in my PHP application — the `calculateDiscount()` function in
`src/Pricing/DiscountService.php` returns 0 instead of the expected percentage
when the customer has a loyalty tier of "gold".

Debug this for me:

1. Read the source of `src/Pricing/DiscountService.php` to understand the logic.
2. Use #debugLaunch to start a UI debug session on port 9003.
3. Use #debugBreakpoints to set a breakpoint at the entry of `calculateDiscount()`.
4. I'll trigger the request from my browser. After that, use #debugStatus to
   detect when execution hits the breakpoint.
5. Once paused, use #debugStackTrace to see the call chain, then #debugScopes
   and #debugVariables to inspect the `$customer` and `$tier` variables.
6. Use #debugEvaluate to test `$customer->getLoyaltyTier()` and
   `$this->tierMultipliers['gold']`.
7. Use #debugNext to step through the discount calculation line by line,
   inspecting variables after each step.
8. Summarize what you found — which line produces the wrong value and why.
9. Use #debugTerminate to end the session.
```

The `#toolReferenceName` syntax (e.g. `#debugLaunch`) references the tools directly in Copilot chat. The agent will call each tool in sequence, inspect the results, and report back.

### Typical tool call flow

```
debug_launch  →  debug_breakpoints  →  (wait for hit)  →  debug_status
     →  debug_stack_trace  →  debug_scopes  →  debug_variables
     →  debug_evaluate  →  debug_next  →  debug_variables  →  ...
     →  debug_terminate
```

### Shorter prompt for quick inspection

```
Debug my PHP app in UI mode. Set a breakpoint at line 42 of
src/Controllers/OrderController.php, wait for a hit, then show me
the full variable state and call stack. I'll trigger the request.
```

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
