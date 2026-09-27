// A captioner for tests and local dev: batches live in memory. A test can set each item's answer (a
// caption, a refusal, an empty text, an error), make sending fail, or keep batches `in_progress`.
import type {
  BatchStatus,
  CaptionItem,
  CaptionRequest,
  CaptionResult,
  Captioner,
} from '../../pipeline/ports';

type Batch = {
  items: CaptionItem[];
  request: CaptionRequest;
  status: BatchStatus;
  cancelled: boolean;
};

export type FixtureCaptioner = Captioner & {
  /** Batches sent, by id, with their items and request. */
  batches: Map<string, Batch>;
  /** Every call in order, e.g. `submit:fixture-batch-1`, `cancel:…`, `remove:…`. */
  calls: string[];
  /** The result for an item; by default a plain caption that ended normally. */
  answer: (item: CaptionItem) => Omit<CaptionResult, 'id'>;
  /** Sending throws this when set. */
  failSubmit: Error | null;
  /** New batches stay `in_progress` until cancelled. */
  stayInProgress: boolean;
  reset(): void;
};

/** Runs `fn` as an answer that comes back later; a throw becomes a rejection. */
const later = <T>(fn: () => T): Promise<T> => Promise.resolve().then(fn);

const DEFAULT_ANSWER = (): Omit<CaptionResult, 'id'> => ({
  outcome: 'succeeded',
  text: 'A person walks a dog along a canal at dusk.',
  stopReason: 'end_turn',
  inputTokens: 972,
  outputTokens: 14,
});

export function fixtureCaptioner(): FixtureCaptioner {
  let next = 0;
  const batchOf = (id: string) => {
    const batch = fixture.batches.get(id);
    if (!batch) throw new Error(`No batch ${id}`);
    return batch;
  };
  const fixture: FixtureCaptioner = {
    batches: new Map(),
    calls: [],
    answer: DEFAULT_ANSWER,
    failSubmit: null,
    stayInProgress: false,
    submit(items, request) {
      return later(() => {
        if (fixture.failSubmit) {
          fixture.calls.push('submit:failed');
          throw fixture.failSubmit;
        }
        next += 1;
        const id = `fixture-batch-${next}`;
        fixture.calls.push(`submit:${id}`);
        fixture.batches.set(id, {
          items,
          request,
          status: fixture.stayInProgress ? 'in_progress' : 'ended',
          cancelled: false,
        });
        return id;
      });
    },
    status(batchId) {
      return later(() => {
        fixture.calls.push(`status:${batchId}`);
        return batchOf(batchId).status;
      });
    },
    results(batchId) {
      return {
        [Symbol.asyncIterator]: async function* () {
          const list = await later(() => {
            fixture.calls.push(`results:${batchId}`);
            const batch = batchOf(batchId);
            // Results come back in any order: newest item first here. A cancelled batch answers nothing.
            return [...batch.items]
              .reverse()
              .map((item): CaptionResult =>
                batch.cancelled
                  ? { id: item.id, outcome: 'canceled', inputTokens: 0, outputTokens: 0 }
                  : { id: item.id, ...fixture.answer(item) },
              );
          });
          yield* list;
        },
      };
    },
    cancel(batchId) {
      return later(() => {
        fixture.calls.push(`cancel:${batchId}`);
        const batch = batchOf(batchId);
        if (batch.status === 'in_progress') batch.cancelled = true;
        batch.status = 'ended';
      });
    },
    remove(batchId) {
      return later(() => {
        fixture.calls.push(`remove:${batchId}`);
        if (batchOf(batchId).status !== 'ended')
          throw new Error('A batch is removed once it ended.');
        fixture.batches.delete(batchId);
      });
    },
    reset() {
      fixture.batches.clear();
      fixture.calls.length = 0;
      fixture.answer = DEFAULT_ANSWER;
      fixture.failSubmit = null;
      fixture.stayInProgress = false;
    },
  };
  return fixture;
}
