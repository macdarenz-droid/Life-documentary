// The episode pipeline (P12, D38, D42): a Cloudflare Workflow, one instance per documentary and week,
// started by the weekly cron. Understand, plan (P13, D39), keep the chosen answers, delete the working
// copies, narrate (P14, D40), ask the phone for originals and wait for them until `renderAt`, render
// (P15, D41), sleep until `deliverAt`, publish with one push, and record the run. Step results hold ids,
// keys, outcomes and counts only, and every time-dependent value is read inside a step.
// Sending a caption batch is never retried (a failure can leave no second, forgotten batch), a failed
// transcript leaves that answer without one, and batches that do not end in 2 hours are cancelled: the
// run goes on with what it has. From planning on, a step that fails after its retries, or a render that
// fails or has nothing to draw, gives the recap as the next plan version (D20); if that fails too, the
// episode is `failed` and nothing is pushed. An empty week ends quietly (D2).
import { LocalDate, Timestamp, Uuid } from '@life/contracts';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { z } from 'zod';
import * as episodeRuns from '../data/repositories/episodeRuns';
import * as episodes from '../data/repositories/episodes';
import * as originalRequests from '../data/repositories/originalRequests';
import type { Env } from '../shared/env';
import { deliverContext } from './deliver/context';
import { keepAnswers } from './deliver/keepAnswers';
import { requestOriginals } from './deliver/requestOriginals';
import { markFailed, msUntil, publish, recordRun, storeRecap } from './deliver/steps';
import { fitStep, lineStep, linesStep, narrateContext, recordNarrateCosts } from './narrate/steps';
import {
  planContext,
  planStep,
  recapStep,
  recordPlanCosts,
  type PlanStepResult,
} from './plan/steps';
import type { PlanUsage } from './ports';
import { checkRender, renderContext, startRender } from './render/steps';
import { understandContext, type EpisodeRef } from './understand/context';
import { CAPTION_CHECK_EVERY, CAPTION_CHECKS, CAPTION_ENDING_CHECKS } from './understand/settings';
import {
  captionChunks,
  inventory,
  readCaptions,
  recordCosts,
  removeWorkingCopies,
  submitCaptions,
  removeCaptionBatches,
  transcribeAnswer,
  unfinished,
  type CaptionUsage,
} from './understand/understand';

export const EpisodePipelineParams = z.object({
  documentaryId: Uuid,
  weekStart: LocalDate,
  /** When the run renders with whatever originals arrived. */
  renderAt: Timestamp,
  /** When the episode is published (`episodeHour`:00 on the delivery day). */
  deliverAt: Timestamp,
});
export type EpisodePipelineParams = z.infer<typeof EpisodePipelineParams>;

export type EpisodePipelineOutput = {
  episodeId: string;
  transcribed: number;
  captioned: number;
  costCents: number;
  /** Which plan the week got at planning; `empty` when it had nothing to show and the episode is gone. */
  plan: 'model' | 'recap' | 'empty';
  /** How the run ended. */
  outcome: episodeRuns.RunOutcome;
};

/** The event the upload route sends when every requested original has arrived. */
export const ORIGINALS_READY_EVENT = 'originals-ready';
/** Seconds between render checks, and the most checks before a render counts as failed. */
export const RENDER_CHECK_EVERY = '20 seconds';
export const RENDER_CHECKS = 45;

const NO_USAGE: CaptionUsage = { kept: 0, dropped: 0, inputTokens: 0, outputTokens: 0 };
const NO_PLAN_USAGE: PlanUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

/** How one render ended. */
type RenderEnd = 'done' | 'nothing' | 'failed' | 'gone' | 'round-limit' | 'start-failed';

export class EpisodePipeline extends WorkflowEntrypoint<Env, EpisodePipelineParams> {
  override async run(
    event: Readonly<WorkflowEvent<EpisodePipelineParams>>,
    step: WorkflowStep,
  ): Promise<EpisodePipelineOutput> {
    const params = EpisodePipelineParams.parse(event.payload);
    const ctx = understandContext(this.env);
    const key = { documentaryId: params.documentaryId, weekStart: params.weekStart };
    let episodeId: Uuid | null = null;
    let understood = { transcribed: 0, captioned: 0 };
    try {
      const episode: EpisodeRef = await step.do('episode', async () => {
        const now = ctx.clock.now();
        const found = await episodes.getOrCreate(
          ctx.db,
          params.documentaryId,
          params.weekStart,
          now,
        );
        await episodes.setState(ctx.db, found.id, 'understanding', now);
        await episodeRuns.start(ctx.db, key, {
          episodeId: found.id,
          startedAt: now,
          dueAt: params.deliverAt,
        });
        return { id: found.id, documentaryId: found.documentaryId, weekStart: found.weekStart };
      });
      episodeId = episode.id;
      const found = await this.understand(step, episode);
      understood = { transcribed: found.transcribed, captioned: found.captioned };
      return await this.deliver(step, params, episode, found.keys, understood);
    } catch (error) {
      console.error('The week could not be made.', error);
      const failedId = episodeId;
      await step.do('run-failed', async () => {
        if (failedId) await markFailed(ctx, failedId);
        // A run that failed in its first step has no row yet; later crons then skip the week.
        await episodeRuns.ensure(ctx.db, key, {
          episodeId: failedId,
          startedAt: ctx.clock.now(),
          dueAt: params.deliverAt,
        });
        return recordRun(ctx, key, { outcome: 'failed', episodeId: failedId, originalsAsked: 0 });
      });
      return {
        episodeId: failedId ?? '',
        ...understood,
        costCents: 0,
        plan: 'recap',
        outcome: 'failed',
      };
    }
  }

  /** Step 1: transcripts and captions. The working copies stay until the chosen answers are kept. */
  private async understand(step: WorkflowStep, episode: EpisodeRef) {
    const ctx = understandContext(this.env);
    const found = await step.do('inventory', () => inventory(ctx, episode));

    // Captions first, so the batches work while the answers are transcribed.
    const sent: string[] = [];
    const chunks = captionChunks(found.images);
    for (const [i, chunk] of chunks.entries()) {
      try {
        const id = await step.do(`captions-submit-${i}`, { retries: { limit: 0, delay: 0 } }, () =>
          submitCaptions(ctx, chunk),
        );
        if (id) sent.push(id);
      } catch (error) {
        console.error(`Caption batch ${i} was not sent; its images go without captions.`, error);
      }
    }

    let seconds = 0;
    let transcribed = 0;
    for (const answer of found.answers) {
      try {
        seconds += await step.do(
          `transcribe-${answer.momentId}`,
          { retries: { limit: 1, delay: '10 seconds', backoff: 'constant' }, timeout: '2 minutes' },
          () => transcribeAnswer(ctx, episode, answer),
        );
        transcribed += 1;
      } catch (error) {
        console.error(`Answer ${answer.momentId} was not transcribed.`, error);
      }
    }

    let pending = sent;
    for (let n = 1; n <= CAPTION_CHECKS && pending.length > 0; n += 1) {
      await step.sleep(`captions-wait-${n}`, CAPTION_CHECK_EVERY);
      pending = await step.do(`captions-check-${n}`, () => unfinished(ctx, pending));
    }
    if (pending.length > 0) {
      const toCancel = pending;
      await step.do('captions-cancel', async () => {
        for (const id of toCancel) await ctx.captioner.cancel(id);
        return toCancel.length;
      });
      for (let n = 1; n <= CAPTION_ENDING_CHECKS && pending.length > 0; n += 1) {
        await step.sleep(`captions-ending-${n}`, CAPTION_CHECK_EVERY);
        pending = await step.do(`captions-ending-check-${n}`, () => unfinished(ctx, pending));
      }
    }
    const ended = sent.filter((id) => !pending.includes(id));

    let usage = NO_USAGE;
    if (ended.length > 0) {
      try {
        const imageIds = found.images.map((image) => image.momentId);
        usage = await step.do('captions-read', () => readCaptions(ctx, episode, ended, imageIds));
      } catch (error) {
        console.error('The captions could not be read; the episode goes without them.', error);
      }
    }
    if (sent.length > 0) {
      const stillOpen = pending;
      try {
        await step.do('captions-delete', async () => {
          for (const id of stillOpen)
            console.error(`Caption batch ${id} had not ended; not deleted.`);
          return removeCaptionBatches(ctx, ended);
        });
      } catch (error) {
        console.error('The caption batches could not all be deleted.', error);
      }
    }

    await step.do('costs', () =>
      recordCosts(ctx, episode, {
        seconds,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      }),
    );
    await step.do('planning', async () => {
      const now = ctx.clock.now();
      await episodes.setState(ctx.db, episode.id, 'planning', now);
      await episodeRuns.mark(ctx.db, episode, { understoodAt: now });
      return 'planning';
    });
    return { keys: found.keys, transcribed, captioned: usage.kept };
  }

  /**
   * Plan, keep the chosen answers, delete the working copies, narrate, ask for originals, render,
   * publish and record. From planning on, a failure gives the recap as the next plan version.
   */
  private async deliver(
    step: WorkflowStep,
    params: EpisodePipelineParams,
    episode: EpisodeRef,
    keys: string[],
    understood: { transcribed: number; captioned: number },
  ): Promise<EpisodePipelineOutput> {
    const ctx = understandContext(this.env);
    const deliverCtx = deliverContext(this.env);
    const key = { documentaryId: params.documentaryId, weekStart: params.weekStart };
    const result = { episodeId: episode.id, ...understood };
    let plan: EpisodePipelineOutput['plan'] = 'model';
    let asked = 0;
    let costCents = 0;
    let rendered = false;
    // How the last render ended, for the log when the week has no episode.
    let lastRender: RenderEnd = 'nothing';

    try {
      // Step 2: plan. A model plan when it passes the checks, else the recap (D20); a week with
      // nothing to show has no episode.
      const planCtx = planContext(this.env);
      let planned: PlanStepResult | undefined;
      try {
        planned = await step.do('plan', { retries: { limit: 1, delay: '10 seconds' } }, () =>
          planStep(planCtx, episode.id),
        );
      } catch (error) {
        console.error('Planning failed; the week gets the recap.', error);
      }
      if (planned?.outcome !== 'empty' && planned?.outcome !== 'model') {
        plan = await step.do('plan-recap', () => recapStep(planCtx, episode.id));
      }
      if (planned?.outcome === 'empty' || plan === 'empty') {
        await step.do('working-copies', () => removeWorkingCopies(ctx, keys));
        await step.do('run-record', () =>
          recordRun(deliverCtx, key, { outcome: 'empty', episodeId: null, originalsAsked: 0 }),
        );
        return { ...result, costCents: 0, plan: 'empty', outcome: 'empty' };
      }
      const planUsage = planned && 'usage' in planned ? planned.usage : NO_PLAN_USAGE;
      costCents = await step.do('plan-costs', async () => {
        const cents = await recordPlanCosts(planCtx, episode.id, planUsage);
        await episodeRuns.mark(ctx.db, key, { plannedAt: ctx.clock.now() });
        return cents;
      });

      // The chosen answers are kept before the working copies go (D42).
      await step.do('keep-answers', async () => {
        const stored = await episodes.get(ctx.db, episode.id);
        return stored ? keepAnswers(deliverCtx, stored) : [];
      });
      await step.do('working-copies', () => removeWorkingCopies(ctx, keys));

      // Step 3: narrate, only for a model plan with lines. A line that still fails after its retries
      // is left out; a 429 is common when many episodes start together, hence the long backoff.
      if (plan === 'model') {
        const narrateCtx = narrateContext(this.env);
        const lines = await step.do('narrate-lines', () => linesStep(narrateCtx, episode.id));
        if (lines.indices.length > 0) {
          let characters = 0;
          for (const index of lines.indices) {
            try {
              const spoken = await step.do(
                `narrate-${index}`,
                { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' } },
                () => lineStep(narrateCtx, episode.id, lines.planVersion, index),
              );
              if ('characters' in spoken) characters += spoken.characters;
            } catch (error) {
              console.error(`Narration line ${index} was not spoken; it is left out.`, error);
            }
          }
          await step.do('narrate-fit', () => fitStep(narrateCtx, episode.id, lines.planVersion));
          costCents = await step.do('narrate-costs', async () => {
            const cents = await recordNarrateCosts(narrateCtx, episode.id, characters);
            await episodeRuns.mark(ctx.db, key, { narratedAt: ctx.clock.now() });
            return cents;
          });
        }
      }

      // Originals: ask, wait until `renderAt` for all of them at most, then stop waiting.
      asked = await step.do('request-originals', async () => {
        const stored = await episodes.get(ctx.db, episode.id);
        return stored ? requestOriginals(deliverCtx, stored) : 0;
      });
      if (asked > 0) {
        const waitMs = await step.do('wait-length', () =>
          Promise.resolve(msUntil(params.renderAt, ctx.clock.now())),
        );
        if (waitMs > 0) {
          try {
            await step.waitForEvent('wait-originals', {
              type: ORIGINALS_READY_EVENT,
              timeout: waitMs,
            });
          } catch {
            // Not all arrived by `renderAt`: the episode is made with what did.
          }
        }
      }
      await this.closeRequests(step, 'close-requests', episode.id);
      lastRender = await this.render(step, episode.id, '');
      rendered = lastRender === 'done';
    } catch (error) {
      console.error('The episode could not be made from its plan; it gets the recap.', error);
    }

    let outcome: episodeRuns.RunOutcome = plan === 'model' ? 'model' : 'recap';
    if (!rendered) {
      try {
        await this.closeRequests(step, 'recap-close', episode.id);
        const recap = await step.do('recap-store', async () => {
          const stored = await episodes.get(ctx.db, episode.id);
          return stored ? storeRecap(deliverCtx, episode.id, stored.planVersion) : 'nothing';
        });
        if (recap === 'recap') {
          outcome = 'recap';
          lastRender = await this.render(step, episode.id, 'recap-');
          rendered = lastRender === 'done';
        } else {
          lastRender = 'nothing';
        }
      } catch (error) {
        console.error('The recap could not be made either.', error);
      }
    }
    if (!rendered) {
      // Ids and the render's last outcome only, no content.
      console.error('The week has no episode.', {
        episodeId: episode.id,
        render: lastRender,
      });
      const failedAsked = asked;
      await step.do('run-failed', async () => {
        await markFailed(deliverCtx, episode.id);
        return recordRun(deliverCtx, key, {
          outcome: 'failed',
          episodeId: episode.id,
          originalsAsked: failedAsked,
        });
      });
      return { ...result, costCents, plan, outcome: 'failed' };
    }

    // Deliver at the hour: sleep only when it is still ahead.
    const later = await step.do('deliver-check', () =>
      Promise.resolve(msUntil(params.deliverAt, ctx.clock.now())),
    );
    if (later > 0) await step.sleepUntil('deliver-wait', new Date(params.deliverAt));
    await step.do('publish', () => publish(deliverCtx, episode.id, key));
    const finalOutcome = outcome;
    const finalAsked = asked;
    // The episode is out: bookkeeping that fails now is logged, never turns the week into `failed`.
    try {
      await step.do('run-record', () =>
        recordRun(deliverCtx, key, {
          outcome: finalOutcome,
          episodeId: episode.id,
          originalsAsked: finalAsked,
        }),
      );
      const known = costCents;
      costCents = await step.do('cost-check', async () => {
        const stored = await episodes.get(ctx.db, episode.id);
        return stored?.costCents ?? known;
      });
    } catch (error) {
      console.error('The published week was not fully recorded.', {
        episodeId: episode.id,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
    return { ...result, costCents, plan, outcome };
  }

  /** Closes the episode's open requests; the run no longer waits for them. */
  private async closeRequests(step: WorkflowStep, name: string, episodeId: Uuid): Promise<void> {
    const ctx = deliverContext(this.env);
    await step.do(name, async () => {
      const closed = await originalRequests.closeAll(ctx.db, ctx.media, episodeId, ctx.clock.now());
      return closed.length;
    });
  }

  /**
   * One 9:16 render: started with retries, then checked every 20 s at most 45 times. A throw after the
   * retries, nothing to render, a failed render or the round limit all count as failed; the result says
   * which.
   */
  private async render(step: WorkflowStep, episodeId: Uuid, prefix: string): Promise<RenderEnd> {
    const ctx = renderContext(this.env);
    let started;
    try {
      started = await step.do(
        `${prefix}render-start`,
        { retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' } },
        async () => {
          const out = await startRender(ctx, episodeId, 'portrait');
          if (out.outcome === 'started') {
            const now = ctx.clock.now();
            await episodes.setState(ctx.db, episodeId, 'rendering', now);
            const stored = await episodes.get(ctx.db, episodeId);
            if (stored) {
              await episodeRuns.mark(
                ctx.db,
                { documentaryId: stored.documentaryId, weekStart: stored.weekStart },
                { renderStartedAt: now },
              );
            }
          }
          return out;
        },
      );
    } catch (error) {
      console.error('The render could not be started.', error);
      return 'start-failed';
    }
    if (started.outcome !== 'started') return 'nothing';
    const renderId = started.id;
    for (let n = 1; n <= RENDER_CHECKS; n += 1) {
      await step.sleep(`${prefix}render-sleep-${n}`, RENDER_CHECK_EVERY);
      const checked = await step.do(`${prefix}render-check-${n}`, () => checkRender(ctx, renderId));
      if (
        checked.outcome === 'done' ||
        checked.outcome === 'failed' ||
        checked.outcome === 'gone'
      ) {
        return checked.outcome;
      }
    }
    return 'round-limit';
  }
}

export const episodeInstanceId = (documentaryId: string, weekStart: string) =>
  `ep-${documentaryId}-${weekStart}`;

/** Starts the week's pipeline with its times, or gives back the instance that already exists for it. */
export async function startEpisodePipeline(
  env: Pick<Env, 'EPISODE_PIPELINE'>,
  documentaryId: Uuid,
  weekStart: LocalDate,
  times: { renderAt: Timestamp; deliverAt: Timestamp },
): Promise<WorkflowInstance> {
  const params = EpisodePipelineParams.parse({ documentaryId, weekStart, ...times });
  const id = episodeInstanceId(documentaryId, weekStart);
  try {
    return await env.EPISODE_PIPELINE.create({ id, params });
  } catch {
    // The id exists: this week's run was started before.
    return env.EPISODE_PIPELINE.get(id);
  }
}
