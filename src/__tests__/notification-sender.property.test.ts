/**
 * Property-based tests for VsCodeNotificationSender.
 * Property 11: Notification logging completeness.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import { createMockOutputChannel, createMockStatusBarItem } from '../__mocks__/vscode.js';
import { VsCodeNotificationSender } from '../notification-sender.js';

// --- Generators ---

const arbEventName = fc.stringMatching(/^[a-z]{2,20}$/);
const arbLevel = fc.constantFrom('debug', 'info', 'warning', 'error');
const arbMessage = fc.string({ minLength: 1, maxLength: 100 });
const arbDetails = fc.dictionary(
  fc.stringMatching(/^[a-z]{1,10}$/),
  fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean()),
  { minKeys: 0, maxKeys: 5 },
) as fc.Arbitrary<Record<string, unknown>>;

let outputChannel: ReturnType<typeof createMockOutputChannel>;
let statusBarItem: ReturnType<typeof createMockStatusBarItem>;
let sender: VsCodeNotificationSender;

beforeEach(() => {
  outputChannel = createMockOutputChannel();
  statusBarItem = createMockStatusBarItem();
  sender = new VsCodeNotificationSender(outputChannel, statusBarItem);
});

describe('Feature: vscode-agentic-debug, Property 11: Notification logging completeness', () => {
  /**
   * **Validates: Requirements 9.2, 9.3, 9.6**
   *
   * For any event name and details passed to sendDebugEvent(), the output
   * channel SHALL contain a log entry that includes the event name.
   * For any log level and message passed to sendLog(), the output channel
   * SHALL contain an entry with the level prefix and message.
   */
  it('sendDebugEvent logs event name to output channel', async () => {
    await fc.assert(
      fc.asyncProperty(arbEventName, arbDetails, async (event, details) => {
        outputChannel._lines.length = 0;
        await sender.sendDebugEvent(event, details);

        const logged = outputChannel._lines.some(
          (line: string) => line.includes(event),
        );
        expect(logged).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('sendLog logs level prefix and message to output channel', async () => {
    await fc.assert(
      fc.asyncProperty(arbLevel, arbMessage, async (level, message) => {
        outputChannel._lines.length = 0;
        await sender.sendLog(level, message);

        const logged = outputChannel._lines.some(
          (line: string) => line.includes(`[${level}]`) && line.includes(message),
        );
        expect(logged).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
