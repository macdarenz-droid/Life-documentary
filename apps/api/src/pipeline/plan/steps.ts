// Step 2 of the episode pipeline (P13, D39) as plain functions, so they run without a Workflow. Only
// outcomes, error strings and token counts leave a step; the plan itself is stored in D1 by the step.
import type { Episode, EpisodeState, Timestamp, WeekBriefV1 } from '@life/contracts';
import { planEligibility, recapPlan, weekBrief } from '@life/story';
import { database, type Db } from '../../data/db';
import { briefInput } from '../../data/repositories/brief';
import * as costLedger from '../../data/repositories/costLedger';
import * as episodes from '../../data/repositories/episodes';
import * as plans from '../../data/repositories/plans';
import { episodeCostCents, planCostRows } from '../../policy/costs';
import { pipelineProviders } from '../../providers';
import type { Env } from '../../shared/env';
import type { PlanUsage, Planner } from '../ports';
import { planOnce } from './planOnce';

export type PlanContext = { db: Db; planner: Planner; clock: { now(): Timestamp } };

export function planContext(env: Env): PlanContext {
  return {
    db: database(env.DB),
    planner: pipelineProviders(env).planner,
    clock: { now: () => new Date().toISOString() },
  };
}

export type PlanStepResult =
  | { outcome: 'empty' }
  | { outcome: 'recap-needed' }
  | { outcome: 'model' | 'invalid' | 'refused'; errors: string[]; usage: PlanUsage };

const PLAN_VERSION = 1;

async function episodeOf(ctx: PlanContext, id: Episode['id']): Promise<Episode> {
  const episode = await episodes.get(ctx.db, id);
  if (!episode) throw new Error('The episode is gone.');
  return episode;
}

async function briefOf(ctx: PlanContext, episode: Episode): Promise<WeekBriefV1> {
  return weekBrief(await briefInput(ctx.db, episode));
}

/**
 * Plans the episode: nothing for a week without pictures or sound (the episode is removed), the recap
 * for a week the model does not get, else the model with one retry. A model plan is stored as version 1.
 */
export async function planStep(
  ctx: PlanContext,
  episodeId: Episode['id'],
): Promise<PlanStepResult> {
  const episode = await episodeOf(ctx, episodeId);
  const brief = await briefOf(ctx, episode);
  const eligibility = planEligibility(brief);
  if (eligibility === 'empty') {
    await episodes.remove(ctx.db, episode.id);
    return { outcome: 'empty' };
  }
  if (eligibility === 'recap') return { outcome: 'recap-needed' };

  const result = await planOnce(brief, ctx.planner);
  if (result.outcome !== 'model') {
    return { outcome: result.outcome, errors: result.errors, usage: result.usage };
  }
  const now = ctx.clock.now();
  await plans.put(ctx.db, {
    episodeId: episode.id,
    version: PLAN_VERSION,
    plan: result.plan,
    createdBy: 'model',
    createdAt: now,
  });
  const narrated = result.plan.scenes.some((s) => s.narratorBridge) || !!result.plan.tease;
  const state: EpisodeState = narrated ? 'narrating' : 'rendering';
  await episodes.setPlan(
    ctx.db,
    episode.id,
    { version: PLAN_VERSION, summary: result.plan.summary, state },
    now,
  );
  return { outcome: 'model', errors: [], usage: result.usage };
}

/** Stores the recap plan as version 1; a week that turns out to have no media is removed instead. */
export async function recapStep(
  ctx: PlanContext,
  episodeId: Episode['id'],
): Promise<'recap' | 'empty'> {
  const episode = await episodeOf(ctx, episodeId);
  const plan = recapPlan(await briefOf(ctx, episode));
  if (!plan) {
    await episodes.remove(ctx.db, episode.id);
    return 'empty';
  }
  const now = ctx.clock.now();
  await plans.put(ctx.db, {
    episodeId: episode.id,
    version: PLAN_VERSION,
    plan,
    createdBy: 'recap',
    createdAt: now,
  });
  await episodes.setPlan(
    ctx.db,
    episode.id,
    { version: PLAN_VERSION, summary: plan.summary, state: 'rendering' },
    now,
  );
  return 'recap';
}

/** One ledger row per unit the planner used over its calls, then the episode's cost in cents. */
export async function recordPlanCosts(
  ctx: PlanContext,
  episodeId: Episode['id'],
  usage: PlanUsage,
): Promise<number> {
  const at = ctx.clock.now();
  for (const row of planCostRows(usage)) {
    await costLedger.upsert(ctx.db, {
      ...row,
      episodeId,
      step: 'plan',
      provider: 'anthropic',
      at,
    });
  }
  const cents = episodeCostCents(await costLedger.forEpisode(ctx.db, episodeId));
  await episodes.setCostCents(ctx.db, episodeId, cents, at);
  return cents;
}
