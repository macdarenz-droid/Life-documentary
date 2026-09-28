// A renderer for tests and local dev: it records each start, puts a tiny MP4 at the render's key in R2,
// and reports `done` after a number of progress calls a test can set. A test can instead make the next
// render fail, or set the cost it reports.
import type { RenderProgress, RenderStart, Renderer } from '../../pipeline/ports';
import { TINY_MP4 } from './tinyMp4';

export type FixtureRenderer = Renderer & {
  /** Every start, in order. */
  starts: RenderStart[];
  /** Progress calls per render before it reports `done` (1: the first call does). */
  callsUntilDone: number;
  /** What the next renders end with instead of `done`, in order. */
  outcomes: Extract<RenderProgress, { state: 'failed' }>[];
  /** The accrued cost a finished render reports, in USD. */
  costUsd: number | undefined;
  /** Where the MP4 goes; set by `pipelineProviders` to the Worker's bucket. */
  media: R2Bucket | undefined;
  reset(): void;
};

export const FIXTURE_BUCKET = 'fixture-renders';
const DEFAULT_COST_USD = 0.0123;

export function fixtureRenderer(): FixtureRenderer {
  const renders = new Map<string, { calls: number; ending?: RenderProgress }>();
  const fixture: FixtureRenderer = {
    starts: [],
    callsUntilDone: 1,
    outcomes: [],
    costUsd: DEFAULT_COST_USD,
    media: undefined,
    async start(input) {
      fixture.starts.push(input);
      const renderId = `fixture-render-${fixture.starts.length}`;
      const failed = fixture.outcomes.shift();
      renders.set(renderId, { calls: 0, ...(failed ? { ending: failed } : {}) });
      if (!failed && fixture.media) {
        await fixture.media.put(input.outKey, TINY_MP4, {
          httpMetadata: { contentType: 'video/mp4' },
        });
      }
      return { renderId, bucketName: FIXTURE_BUCKET };
    },
    progress({ renderId }) {
      return Promise.resolve().then((): RenderProgress => {
        const render = renders.get(renderId);
        if (!render) return { state: 'failed', reason: 'render failed' };
        render.calls += 1;
        if (render.calls < fixture.callsUntilDone) {
          return { state: 'rendering', fraction: render.calls / fixture.callsUntilDone };
        }
        if (render.ending) return render.ending;
        return {
          state: 'done',
          ...(fixture.costUsd !== undefined ? { costUsd: fixture.costUsd } : {}),
          bytes: TINY_MP4.byteLength,
        };
      });
    },
    reset() {
      renders.clear();
      fixture.starts.length = 0;
      fixture.callsUntilDone = 1;
      fixture.outcomes.length = 0;
      fixture.costUsd = DEFAULT_COST_USD;
    },
  };
  return fixture;
}
