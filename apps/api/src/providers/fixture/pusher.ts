// A pusher for tests and local dev: it records every message and answers `sent`, or the outcome a test
// sets for a token.
import type { PushMessage, PushOutcome, Pusher } from '../../pipeline/ports';

export type FixturePusher = Pusher & {
  /** Every message, in order. */
  sent: PushMessage[];
  /** The outcome for a token; `sent` when unset. */
  outcomes: Map<string, PushOutcome>;
  reset(): void;
};

export function fixturePusher(): FixturePusher {
  const fixture: FixturePusher = {
    sent: [],
    outcomes: new Map(),
    send(messages) {
      fixture.sent.push(...messages);
      return Promise.resolve(
        messages.map((m) => ({ to: m.to, outcome: fixture.outcomes.get(m.to) ?? 'sent' })),
      );
    },
    reset() {
      fixture.sent = [];
      fixture.outcomes.clear();
    },
  };
  return fixture;
}
