// A pusher for tests and local dev: it records every message and answers `sent`, or the outcome a test
// sets for a token. A test can make the next sends throw after recording, as a dropped answer would.
import type { PushMessage, PushOutcome, Pusher } from '../../pipeline/ports';

export type FixturePusher = Pusher & {
  /** Every message, in order. */
  sent: PushMessage[];
  /** The outcome for a token; `sent` when unset. */
  outcomes: Map<string, PushOutcome>;
  /** What the next sends throw, in order, after recording their messages. */
  failures: Error[];
  reset(): void;
};

export function fixturePusher(): FixturePusher {
  const fixture: FixturePusher = {
    sent: [],
    outcomes: new Map(),
    failures: [],
    send(messages) {
      fixture.sent.push(...messages);
      const failure = fixture.failures.shift();
      if (failure) return Promise.reject(failure);
      return Promise.resolve(
        messages.map((m) => ({ to: m.to, outcome: fixture.outcomes.get(m.to) ?? 'sent' })),
      );
    },
    reset() {
      fixture.sent = [];
      fixture.outcomes.clear();
      fixture.failures = [];
    },
  };
  return fixture;
}
