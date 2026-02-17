/**
 * Property-based tests for SessionFactory.buildConfig() pathMappings resolution.
 * Property 6: pathMappings resolution chain with nonEmpty.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

import * as vscode from 'vscode';
import { SessionFactory } from '../session-factory.js';
import type { VsCodeNotificationSender } from '../notification-sender.js';
import { createMockOutputChannel } from '../__mocks__/vscode.js';
import type { LaunchInput } from '../types.js';

// --- Mock ts-php-debug-mcp modules (not exercised, but required for import) ---

vi.mock('ts-php-debug-mcp/session.js', () => ({ SessionManager: vi.fn() }));
vi.mock('ts-php-debug-mcp/dap-client.js', () => ({ DAPClient: vi.fn() }));
vi.mock('ts-php-debug-mcp/path-mapper.js', () => ({ PathMapper: vi.fn() }));
vi.mock('ts-php-debug-mcp/breakpoint-ledger.js', () => ({ BreakpointLedger: vi.fn() }));
vi.mock('ts-php-debug-mcp/tools/debug-launch.js', () => ({ handleDebugLaunch: vi.fn() }));
vi.mock('ts-php-debug-mcp/tools/debug-terminate.js', () => ({ handleDebugTerminate: vi.fn() }));
vi.mock('../vscode-debug-backend.js', () => ({ VsCodeDebugBackend: vi.fn() }));

// --- Helpers ---

function createMockNotifier(): VsCodeNotificationSender {
  return {
    sendProgress: vi.fn(),
    sendLog: vi.fn(),
    sendDebugEvent: vi.fn(),
  } as unknown as VsCodeNotificationSender;
}

/**
 * Configure the vscode.workspace.getConfiguration mock to return
 * different objects for 'agenticDebug' vs 'launch' config sections.
 */
function mockConfigurations(
  agenticDebugSettings: Record<string, unknown>,
  launchConfigurations: Array<{ type: string; name: string; pathMappings?: Record<string, string> }> | undefined,
): void {
  (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockImplementation(
    (section?: string) => {
      if (section === 'launch') {
        return {
          get: vi.fn((key: string) => {
            if (key === 'configurations') return launchConfigurations;
            return undefined;
          }),
        };
      }
      // 'agenticDebug' or any other section
      return {
        get: vi.fn((key: string) => agenticDebugSettings[key]),
      };
    },
  );
}

// --- Generators ---

/** Generate a non-empty pathMappings object (at least 1 key). */
const arbNonEmptyPathMappings = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.string({ minLength: 1, maxLength: 20 }),
  { minKeys: 1, maxKeys: 4 },
);

/** Generate either undefined or an empty object — both should be treated as "absent". */
const arbEmptyOrUndefined = fc.constantFrom(undefined, {});

beforeEach(() => {
  (vscode as any).__resetMocks();
  (vscode.extensions.getExtension as any).mockReturnValue({
    extensionPath: '/mock/extensions/xdebug.php-debug',
  });
});

describe('Feature: session-factory-wiring, Property 6: pathMappings resolution chain with nonEmpty', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   *
   * For any combination of tool pathMappings parameter, VS Code
   * agenticDebug.pathMappings setting, and launch.json PHP config
   * pathMappings:
   * (a) if tool params has a non-empty object, it wins;
   * (b) if tool params is empty/undefined but settings has a non-empty
   *     object, settings wins;
   * (c) if both are empty/undefined but launch.json has a non-empty PHP
   *     config, launch.json wins;
   * (d) if all are empty/undefined, the result is {}.
   * Empty objects ({}) SHALL be treated the same as undefined.
   */

  it('(a) non-empty tool params pathMappings wins over all other tiers', () => {
    fc.assert(
      fc.property(
        arbNonEmptyPathMappings,
        fc.option(arbNonEmptyPathMappings, { nil: undefined }),
        fc.option(arbNonEmptyPathMappings, { nil: undefined }),
        (toolPM, settingsPM, launchPM) => {
          const launchConfigs = launchPM
            ? [{ type: 'php', name: 'Listen', pathMappings: launchPM }]
            : undefined;
          mockConfigurations(
            { pathMappings: settingsPM },
            launchConfigs,
          );

          const factory = new SessionFactory(createMockNotifier(), createMockOutputChannel());
          const config = factory.buildConfig({ pathMappings: toolPM });

          expect(config.pathMappings).toEqual(toolPM);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('(b) non-empty settings pathMappings wins when tool params is empty/undefined', () => {
    fc.assert(
      fc.property(
        arbEmptyOrUndefined,
        arbNonEmptyPathMappings,
        fc.option(arbNonEmptyPathMappings, { nil: undefined }),
        (toolPM, settingsPM, launchPM) => {
          const launchConfigs = launchPM
            ? [{ type: 'php', name: 'Listen', pathMappings: launchPM }]
            : undefined;
          mockConfigurations(
            { pathMappings: settingsPM },
            launchConfigs,
          );

          const factory = new SessionFactory(createMockNotifier(), createMockOutputChannel());
          const config = factory.buildConfig({ pathMappings: toolPM as any });

          expect(config.pathMappings).toEqual(settingsPM);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('(c) launch.json pathMappings wins when tool params and settings are empty/undefined', () => {
    fc.assert(
      fc.property(
        arbEmptyOrUndefined,
        arbEmptyOrUndefined,
        arbNonEmptyPathMappings,
        (toolPM, settingsPM, launchPM) => {
          mockConfigurations(
            { pathMappings: settingsPM },
            [{ type: 'php', name: 'Listen', pathMappings: launchPM }],
          );

          const factory = new SessionFactory(createMockNotifier(), createMockOutputChannel());
          const config = factory.buildConfig({ pathMappings: toolPM as any });

          expect(config.pathMappings).toEqual(launchPM);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('(d) result is {} when all tiers are empty or undefined', () => {
    fc.assert(
      fc.property(
        arbEmptyOrUndefined,
        arbEmptyOrUndefined,
        (toolPM, settingsPM) => {
          // No launch.json configs, or only non-php / empty pathMappings configs
          mockConfigurations(
            { pathMappings: settingsPM },
            [{ type: 'node', name: 'Node App' }],
          );

          const factory = new SessionFactory(createMockNotifier(), createMockOutputChannel());
          const config = factory.buildConfig({ pathMappings: toolPM as any });

          expect(config.pathMappings).toEqual({});
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty objects ({}) are treated the same as undefined at every tier', () => {
    fc.assert(
      fc.property(
        arbNonEmptyPathMappings,
        (launchPM) => {
          // Tool params = {}, settings = {} — both should be skipped
          mockConfigurations(
            { pathMappings: {} },
            [{ type: 'php', name: 'Listen', pathMappings: launchPM }],
          );

          const factory = new SessionFactory(createMockNotifier(), createMockOutputChannel());

          // Explicit empty object in tool params
          const config = factory.buildConfig({ pathMappings: {} });
          expect(config.pathMappings).toEqual(launchPM);
        },
      ),
      { numRuns: 100 },
    );
  });
});
