// The episode pipeline (P12, D38): a Cloudflare Workflow, one instance per documentary and week. Step 1,
// understand, step 2, plan (P13, D39), then step 3, narrate (P14, D40). Step results hold ids, keys, outcomes and counts only.
// Sending a caption batch is never retried (a failure can leave no second, forgotten batch), a failed
// transcript leaves that answer without one, and batches that do not end in 2 hours are cancelled: the
// run goes on with what it has.
import { LocalDate, Uuid } from '@life/contracts';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { z } from 'zod';
import * as episodes from '../data/repositories/episodes';
import type { Env } from '../shared/env';
import { fitStep, lineStep, linesStep, narrateContext, recordNarrateCosts } from './narrate/steps';
import {
  planContext,
  planStep,
  recapStep,
  recordPlanCosts,
  type PlanStepResult,
} from './plan/steps';
import type { PlanUsage } from './ports';
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

export const EpisodePipelineParams = z.object({ documentaryId: Uuid, weekStart: LocalDate });
export type EpisodePipelineParams = z.infer<typeof EpisodePipelineParams>;

export type EpisodePipelineOutput = {
  episodeId: string;
  transcribed: number;
  captioned: number;
  costCents: number;
  /** Which plan the episode got; `empty` when the week had nothing to show and the episode is gone. */
  plan: 'model' | 'recap' | 'empty';
};

const NO_USAGE: CaptionUsage = { kept: 0, dropped: 0, inputTokens: 0, outputTokens: 0 };
const NO_PLAN_USAGE: PlanUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

export class EpisodePipeline extends WorkflowEntrypoint<Env, EpisodePipelineParams> {
  override async run(
    event: Readonly<WorkflowEvent<EpisodePipelineParams>>,
    step: WorkflowStep,
  ): Promise<EpisodePipelineOutput> {
    const params = EpisodePipelineParams.parse(event.payload);
    const ctx = understandContext(this.env);

    const episode: EpisodeRef = await step.do('episode', async () => {
      const found = await episodes.getOrCreate(
        ctx.db,
        params.documentaryId,
        params.weekStart,
        ctx.clock.now(),
      );
      await episodes.setState(ctx.db, found.id, 'understanding', ctx.clock.now());
      return { id: found.id, documentaryId: found.documentaryId, weekStart: found.weekStart };
    });

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

    await step.do('working-copies', () => removeWorkingCopies(ctx, found.keys));
    await step.do('costs', () =>
      recordCosts(ctx, episode, {
        seconds,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      }),
    );
    await step.do('planning', async () => {
      await episodes.setState(ctx.db, episode.id, 'planning', ctx.clock.now());
      return 'planning';
    });

    // Step 2: plan. A model plan when it passes the checks, else the recap, so an episode always
    // arrives (D20); a week with nothing to show has no episode.
    const planCtx = planContext(this.env);
    const understood = { episodeId: episode.id, transcribed, captioned: usage.kept };
    let planned: PlanStepResult | undefined;
    try {
      planned = await step.do('plan', { retries: { limit: 1, delay: '10 seconds' } }, () =>
        planStep(planCtx, episode.id),
      );
    } catch (error) {
      console.error('Planning failed; the week gets the recap.', error);
    }
    if (planned?.outcome === 'empty') return { ...understood, costCents: 0, plan: 'empty' };
    let plan: EpisodePipelineOutput['plan'] = 'model';
    if (planned?.outcome !== 'model') {
      plan = await step.do('plan-recap', () => recapStep(planCtx, episode.id));
      if (plan === 'empty') return { ...understood, costCents: 0, plan };
    }
    const planUsage = planned && 'usage' in planned ? planned.usage : NO_PLAN_USAGE;
    let total = await step.do('plan-costs', () => recordPlanCosts(planCtx, episode.id, planUsage));
    if (plan !== 'model') return { ...understood, costCents: total, plan };

    // Step 3: narrate. A line that still fails after its retries is left out and the run goes on; a
    // 429 is common when many episodes start together, hence the long backoff.
    const narrateCtx = narrateContext(this.env);
    const lines = await step.do('narrate-lines', () => linesStep(narrateCtx, episode.id));
    if (lines.indices.length === 0) return { ...understood, costCents: total, plan };
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
    total = await step.do('narrate-costs', () =>
      recordNarrateCosts(narrateCtx, episode.id, characters),
    );
    return { ...understood, costCents: total, plan };
  }
}

export const episodeInstanceId = (documentaryId: string, weekStart: string) =>
  `ep-${documentaryId}-${weekStart}`;

/** Starts the week's pipeline, or gives back the instance that already exists for it. */
export async function startEpisodePipeline(
  env: Pick<Env, 'EPISODE_PIPELINE'>,
  documentaryId: Uuid,
  weekStart: LocalDate,
): Promise<WorkflowInstance> {
  const params = EpisodePipelineParams.parse({ documentaryId, weekStart });
  const id = episodeInstanceId(documentaryId, weekStart);
  try {
    return await env.EPISODE_PIPELINE.create({ id, params });
  } catch {
    // The id exists: this week's run was started before.
    return env.EPISODE_PIPELINE.get(id);
  }
}
