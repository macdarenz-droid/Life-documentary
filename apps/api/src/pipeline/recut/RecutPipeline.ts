// The re-cut run (P17, D43): a Cloudflare Workflow, one instance per claim (`recut-{episodeId}-v{n}`),
// that always cuts the newest plan. Each round narrates that version (clips are cached by hash, so only
// changed lines are spoken), waits for the answers the edits brought in, renders it and swaps in the new
// video; a round ends by releasing the claim only if the plan hasn't moved on, else it goes round again.
// The episode stays `ready` and the old cut plays throughout. When narration, the wait or the render
// fails, the published plan is stored again as the next version and the claim is released, so the stored
// plan always matches a video or is being cut. Step results hold ids, versions, counts and outcomes only.
import { Uuid } from '@life/contracts';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { z } from 'zod';
import * as episodes from '../../data/repositories/episodes';
import type { Env } from '../../shared/env';
import { ORIGINALS_READY_EVENT, RENDER_CHECKS, RENDER_CHECK_EVERY } from '../EpisodePipeline';
import { fitStep, lineStep, linesStep, narrateContext } from '../narrate/steps';
import { checkRender, renderContext, startRender } from '../render/steps';
import {
  beginRound,
  checkOriginals,
  dropRenders,
  originalsDeadline,
  recordRecutNarration,
  recutContext,
  revertRecut,
  tidyOriginals,
} from './steps';

export const RecutPipelineParams = z.object({ episodeId: Uuid, runId: z.string().min(1) });
export type RecutPipelineParams = z.infer<typeof RecutPipelineParams>;

export type RecutPipelineOutput = {
  /** `published` when a new cut replaced the old one, `failed` when the change was undone. */
  outcome: 'published' | 'failed' | 'ended';
  planVersion?: number;
};

/** The most rounds a run goes before it gives up, and the most checks for answers in one round. */
export const RECUT_ROUNDS = 20;
export const ORIGINALS_CHECKS = 50;
/** How long the old file stays after the new cut is published. */
export const KEEP_OLD_FOR = '30 minutes';

/** How a round ended: rendered, moved on to a newer plan, or failed. */
type RoundEnd = 'rendered' | 'next' | 'failed';

export class RecutPipeline extends WorkflowEntrypoint<Env, RecutPipelineParams> {
  override async run(
    event: Readonly<WorkflowEvent<RecutPipelineParams>>,
    step: WorkflowStep,
  ): Promise<RecutPipelineOutput> {
    const { episodeId, runId } = RecutPipelineParams.parse(event.payload);
    const ctx = recutContext(this.env);
    let failed = false;
    try {
      for (let r = 0; r < RECUT_ROUNDS && !failed; r += 1) {
        const begun = await step.do(`recut-begin-${r}`, () => beginRound(ctx, episodeId, runId));
        if (begun.outcome === 'end') return { outcome: 'ended' };
        const v = begun.planVersion;
        const end = await this.round(step, episodeId, runId, v);
        if (end === 'failed') {
          failed = true;
          break;
        }
        if (end === 'next') continue;

        await step.do(`recut-replace-v${v}`, async () => {
          const tidied = await tidyOriginals(ctx, episodeId);
          const dropped = await dropRenders(ctx, episodeId, 'previous');
          return { tidied, dropped };
        });
        const ended = await step.do(`recut-end-v${v}`, () =>
          episodes.endRecut(ctx.db, episodeId, runId, v, ctx.clock.now()),
        );
        if (!ended) continue;
        await step.sleep('recut-keep-old', KEEP_OLD_FOR);
        await step.do('recut-drop-old', () => dropRenders(ctx, episodeId, 'current'));
        return { outcome: 'published', planVersion: v };
      }
      if (!failed)
        console.error('The re-cut used up its rounds; the change is undone.', { episodeId });
    } catch (error) {
      console.error('The re-cut could not be made; the change is undone.', error);
    }
    return this.fail(step, episodeId, runId);
  }

  /** Narration, the answers the plan needs, then the render of version `v`. */
  private async round(
    step: WorkflowStep,
    episodeId: Uuid,
    runId: string,
    v: number,
  ): Promise<RoundEnd> {
    const ctx = recutContext(this.env);

    // Narration: a line that can't be spoken fails the round, so a person's own words never go missing.
    const narrateCtx = narrateContext(this.env);
    const lines = await step.do(`recut-lines-v${v}`, () => linesStep(narrateCtx, episodeId, v));
    if (lines.indices.length > 0) {
      let characters = 0;
      for (const index of lines.indices) {
        const spoken = await step.do(
          `recut-line-v${v}-${index}`,
          { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' } },
          () => lineStep(narrateCtx, episodeId, v, index),
        );
        if ('characters' in spoken) characters += spoken.characters;
      }
      await step.do(`recut-fit-v${v}`, () => fitStep(narrateCtx, episodeId, v));
      const spokenNow = characters;
      await step.do(`recut-narrate-costs-v${v}`, () =>
        recordRecutNarration(ctx, episodeId, v, spokenNow),
      );
    }

    // The answers the edits brought in: check, wait for a wake-up or the time left, check again.
    const deadline = await step.do(`recut-deadline-v${v}`, () =>
      Promise.resolve(originalsDeadline(ctx)),
    );
    let ready = false;
    for (let w = 0; w < ORIGINALS_CHECKS; w += 1) {
      const checked = await step.do(`recut-originals-v${v}-${w}`, () =>
        checkOriginals(ctx, episodeId, runId, v, deadline),
      );
      if (checked.outcome === 'moved') return 'next';
      if (checked.outcome === 'ready') {
        ready = true;
        break;
      }
      if (checked.leftMs <= 0) return 'failed';
      try {
        await step.waitForEvent(`recut-wait-v${v}-${w}`, {
          type: ORIGINALS_READY_EVENT,
          timeout: checked.leftMs,
        });
      } catch {
        // The time ran out; the next check says whether the deadline passed.
      }
    }
    if (!ready) return 'failed';

    // The render of version v, checked every 20 s at most 45 times.
    const renderCtx = renderContext(this.env);
    let started;
    try {
      started = await step.do(
        `recut-render-start-v${v}`,
        { retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' } },
        () => startRender(renderCtx, episodeId, 'portrait', v),
      );
    } catch (error) {
      console.error('The re-cut render could not be started.', error);
      return 'failed';
    }
    if (started.outcome === 'stale') return 'next';
    if (started.outcome !== 'started') return 'failed';
    const renderId = started.id;
    for (let n = 1; n <= RENDER_CHECKS; n += 1) {
      await step.sleep(`recut-render-sleep-v${v}-${n}`, RENDER_CHECK_EVERY);
      const checked = await step.do(`recut-render-check-v${v}-${n}`, () =>
        checkRender(renderCtx, renderId),
      );
      if (checked.outcome === 'done') return 'rendered';
      if (checked.outcome === 'failed' || checked.outcome === 'gone') return 'failed';
    }
    return 'failed';
  }

  /** The undo: the revert batch, then the tidy. */
  private async fail(
    step: WorkflowStep,
    episodeId: Uuid,
    runId: string,
  ): Promise<RecutPipelineOutput> {
    const ctx = recutContext(this.env);
    await step.do('recut-revert', () => revertRecut(ctx, episodeId, runId));
    await step.do('recut-revert-tidy', () => tidyOriginals(ctx, episodeId));
    return { outcome: 'failed' };
  }
}
