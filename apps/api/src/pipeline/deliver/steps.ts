// The delivery steps of the weekly run (P16, D42) as plain functions, so they run without a Workflow:
// the recap as the next plan version when the model's episode cannot be made, publishing with one
// visible push, and the run record. Only ids, counts and outcomes leave a step.
import type { LocalDate, Timestamp, Uuid } from '@life/contracts';
import { episodeWords, recapPlan, weekBrief } from '@life/story';
import { briefInput } from '../../data/repositories/brief';
import * as documentaries from '../../data/repositories/documentaries';
import * as episodeRuns from '../../data/repositories/episodeRuns';
import * as episodes from '../../data/repositories/episodes';
import * as originalRequests from '../../data/repositories/originalRequests';
import * as plans from '../../data/repositories/plans';
import type { DeliverContext } from './context';
import { pushTo } from './push';

export type RunKey = { documentaryId: Uuid; weekStart: LocalDate };

/**
 * Stores the recap as the plan version after `fromVersion` and points the episode at it (D20). Safe to
 * replay: the same version is written again. `nothing` when the week has nothing the recap can show.
 */
export async function storeRecap(
  ctx: Pick<DeliverContext, 'db' | 'clock'>,
  episodeId: Uuid,
  fromVersion: number,
): Promise<'recap' | 'nothing'> {
  const episode = await episodes.get(ctx.db, episodeId);
  if (!episode) return 'nothing';
  const plan = recapPlan(weekBrief(await briefInput(ctx.db, episode)));
  if (!plan) return 'nothing';
  const version = fromVersion + 1;
  const now = ctx.clock.now();
  await plans.put(ctx.db, { episodeId, version, plan, createdBy: 'recap', createdAt: now });
  await episodes.setPlan(
    ctx.db,
    episodeId,
    { version, summary: plan.summary, state: 'rendering' },
    now,
  );
  return 'recap';
}

/**
 * Sets the episode `ready` with its delivery time and, only when this call moved it, sends one visible
 * push: our fixed title "Episode n is ready" and the episode id, nothing else. Returns whether it moved.
 */
export async function publish(ctx: DeliverContext, episodeId: Uuid, key: RunKey): Promise<boolean> {
  const now = ctx.clock.now();
  const moved = await episodes.setDelivered(ctx.db, episodeId, now);
  if (moved) {
    await episodeRuns.mark(ctx.db, key, { deliveredAt: now });
    const episode = await episodes.get(ctx.db, episodeId);
    const documentary = await documentaries.get(ctx.db, key.documentaryId);
    if (episode && documentary) {
      await pushTo(ctx, documentary.ownerUserId, {
        title: episodeWords.ready(episode.number),
        data: { episodeId },
        silent: false,
      });
    }
  }
  return moved;
}

/** The episode could not be made: `failed`, no push. */
export async function markFailed(
  ctx: Pick<DeliverContext, 'db' | 'clock'>,
  episodeId: Uuid,
): Promise<void> {
  if (await episodes.get(ctx.db, episodeId)) {
    await episodes.setState(ctx.db, episodeId, 'failed', ctx.clock.now());
  }
}

/** Records how the run ended, with the originals asked for and received. */
export async function recordRun(
  ctx: Pick<DeliverContext, 'db'>,
  key: RunKey,
  input: { outcome: episodeRuns.RunOutcome; episodeId: Uuid | null; originalsAsked: number },
): Promise<episodeRuns.RunOutcome> {
  const received =
    input.episodeId === null
      ? 0
      : (await originalRequests.forEpisode(ctx.db, input.episodeId)).filter(
          (r) => r.state === 'met',
        ).length;
  await episodeRuns.finish(ctx.db, key, { ...input, originalsReceived: received });
  return input.outcome;
}

/** Milliseconds from now until `at`, or 0 when it has passed. */
export function msUntil(at: Timestamp, now: Timestamp): number {
  return Math.max(0, Date.parse(at) - Date.parse(now));
}
