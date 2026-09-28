// The re-cut steps (P17, D43) as plain functions, so they run without a Workflow. Every write that
// belongs to the run applies only while the run holds the episode's claim (`recut_run`), so a replay
// after a newer run claimed the episode changes nothing. Only ids, versions, counts and outcomes leave a
// step.
import type { Episode, StoredPlan, Timestamp, Uuid } from '@life/contracts';
import { weekBrief } from '@life/story';
import { database, type Db } from '../../data/db';
import { mediaKey } from '../../data/mediaKeys';
import { briefInput } from '../../data/repositories/brief';
import * as costLedger from '../../data/repositories/costLedger';
import * as episodes from '../../data/repositories/episodes';
import * as originalRequests from '../../data/repositories/originalRequests';
import * as plans from '../../data/repositories/plans';
import * as recutNarration from '../../data/repositories/recutNarration';
import * as renders from '../../data/repositories/renders';
import * as week from '../../data/repositories/week';
import { episodeCostCents, narrateMicroUsd } from '../../policy/costs';
import { uploadsAllowed } from '../../policy/leavesDevice';
import type { Env } from '../../shared/env';
import { msUntil } from '../deliver/steps';
import { planMomentIds } from '../render/steps';

export type RecutContext = { db: Db; media: R2Bucket; clock: { now(): Timestamp } };

export function recutContext(env: Pick<Env, 'DB' | 'MEDIA'>): RecutContext {
  return {
    db: database(env.DB),
    media: env.MEDIA,
    clock: { now: () => new Date().toISOString() },
  };
}

/** How long the run waits for the answers an edit brought in before it undoes the change. */
export const ORIGINALS_WAIT_MS = 24 * 60 * 60 * 1000;

export type BeginResult = { outcome: 'end' } | { outcome: 'round'; planVersion: number };

/**
 * Starts a round: ends the run when the episode is gone, not `ready`, or claimed by another run;
 * otherwise sets `working` and gives the current plan version.
 */
export async function beginRound(
  ctx: RecutContext,
  episodeId: Uuid,
  runId: string,
): Promise<BeginResult> {
  const episode = await episodes.get(ctx.db, episodeId);
  const recut = await episodes.recutOf(ctx.db, episodeId);
  if (!episode || episode.state !== 'ready' || recut?.run !== runId) return { outcome: 'end' };
  await episodes.setRecutState(ctx.db, episodeId, runId, 'working', ctx.clock.now());
  return { outcome: 'round', planVersion: episode.planVersion };
}

/**
 * Stores the characters this round spoke for its plan version, sets the `renarrate` ledger row to the sum
 * over every round (none while it is 0), then the episode's cents. Safe to run again.
 */
export async function recordRecutNarration(
  ctx: RecutContext,
  episodeId: Uuid,
  planVersion: number,
  characters: number,
): Promise<number> {
  await recutNarration.upsert(ctx.db, episodeId, planVersion, characters);
  const spoken = await recutNarration.total(ctx.db, episodeId);
  const at = ctx.clock.now();
  if (spoken > 0) {
    await costLedger.upsert(ctx.db, {
      episodeId,
      step: 'renarrate',
      provider: 'elevenlabs',
      unit: 'character',
      units: spoken,
      microUsd: narrateMicroUsd(spoken),
      at,
    });
  }
  const cents = episodeCostCents(await costLedger.forEpisode(ctx.db, episodeId));
  await episodes.setCostCents(ctx.db, episodeId, cents, at);
  return cents;
}

/** The plan of the episode's current render (the published plan), if there is one. */
export async function publishedPlan(
  ctx: RecutContext,
  episode: Episode,
): Promise<StoredPlan | null> {
  const current = (await renders.forEpisode(ctx.db, episode.id)).find(
    (r) =>
      r.format === 'portrait' && r.state === 'done' && r.renderVersion === episode.renderVersion,
  );
  return current ? plans.get(ctx.db, episode.id, current.planVersion) : null;
}

/** When the run stops waiting for this round's answers. */
export function originalsDeadline(ctx: RecutContext): Timestamp {
  return new Date(Date.parse(ctx.clock.now()) + ORIGINALS_WAIT_MS).toISOString();
}

export type OriginalsResult =
  | { outcome: 'moved' }
  | { outcome: 'ready' }
  | { outcome: 'waiting'; open: number; leftMs: number };

/**
 * One check of the answers plan `planVersion` needs. `moved` when the plan is past it. Otherwise it
 * reopens a request for every answer the plan shows that the published plan doesn't, that the rebuilt
 * brief still has (rule 8) and whose original is not in R2, and closes the open requests for moments the
 * plan doesn't show. With none left open it sets `working`; else `waiting`, with the time left.
 */
export async function checkOriginals(
  ctx: RecutContext,
  episodeId: Uuid,
  runId: string,
  planVersion: number,
  deadline: Timestamp,
): Promise<OriginalsResult> {
  const episode = await episodes.get(ctx.db, episodeId);
  const stored = await plans.get(ctx.db, episodeId, planVersion);
  if (!episode || !stored || episode.planVersion !== planVersion) return { outcome: 'moved' };
  const shown = planMomentIds(stored.plan);
  const published = await publishedPlan(ctx, episode);
  const shownBefore = published ? planMomentIds(published.plan) : new Set<string>();
  const inBrief = new Set(
    weekBrief(await briefInput(ctx.db, episode)).moments.map((m) => m.momentId),
  );
  const byId = new Map(
    (await week.momentsOfWeek(ctx.db, episode.documentaryId, episode.weekStart)).map((m) => [
      m.moment.id,
      m,
    ]),
  );

  const wanted: originalRequests.RequestedAsset[] = [];
  for (const momentId of shown) {
    const found = byId.get(momentId);
    if (shownBefore.has(momentId) || !inBrief.has(momentId)) continue;
    if (!found?.asset || found.moment.kind !== 'answer') continue;
    const key = mediaKey(
      found.asset.ownerUserId,
      episode.documentaryId,
      found.asset.id,
      'original',
    );
    if (await ctx.media.head(key)) continue;
    wanted.push({
      documentaryId: episode.documentaryId,
      momentId: found.moment.id,
      assetId: found.asset.id,
    });
  }
  const now = ctx.clock.now();
  const unshown = (await originalRequests.forEpisode(ctx.db, episodeId)).filter(
    (r) => r.state === 'open' && !shown.has(r.momentId),
  );
  const statements = [
    ...originalRequests.reopenStatements(ctx.db, episodeId, wanted, now),
    ...originalRequests.closeStatements(ctx.db, unshown, now),
  ];
  if (statements.length > 0) {
    await ctx.db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  }

  const open = (await originalRequests.forEpisode(ctx.db, episodeId)).filter(
    (r) => r.state === 'open',
  ).length;
  if (open === 0) {
    await episodes.setRecutState(ctx.db, episodeId, runId, 'working', now);
    return { outcome: 'ready' };
  }
  await episodes.setRecutState(ctx.db, episodeId, runId, 'waiting', now);
  return { outcome: 'waiting', open, leftMs: msUntil(deadline, now) };
}

/**
 * Deletes the original of every moment of the week that neither the published plan nor the current plan
 * shows (both read now), unless `leavesDevice` keeps it with Cloud backup, and closes that asset's
 * requests. A missing object is ignored, so a replay deletes nothing more. Returns the moments tidied.
 */
export async function tidyOriginals(ctx: RecutContext, episodeId: Uuid): Promise<number> {
  const episode = await episodes.get(ctx.db, episodeId);
  if (!episode) return 0;
  const current = await plans.current(ctx.db, episodeId);
  const published = await publishedPlan(ctx, episode);
  const shown = new Set([
    ...(current ? planMomentIds(current.plan) : []),
    ...(published ? planMomentIds(published.plan) : []),
  ]);
  const requests = await originalRequests.forEpisode(ctx.db, episodeId);
  const toClose = [];
  let tidied = 0;
  for (const { moment, asset } of await week.momentsOfWeek(
    ctx.db,
    episode.documentaryId,
    episode.weekStart,
  )) {
    if (!asset || shown.has(moment.id)) continue;
    if (uploadsAllowed(moment, asset.kind, { requested: false }).includes('original')) continue;
    const key = mediaKey(asset.ownerUserId, episode.documentaryId, asset.id, 'original');
    if (await ctx.media.head(key)) {
      await ctx.media.delete(key);
      tidied += 1;
    }
    toClose.push(...requests.filter((r) => r.assetId === asset.id && r.state !== 'closed'));
  }
  const statements = originalRequests.closeStatements(ctx.db, toClose, ctx.clock.now());
  if (statements.length > 0) {
    await ctx.db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  }
  return tidied;
}

/**
 * Deletes the R2 files of every done render of the episode, in both shapes, whose render version is
 * below the current one (`current`) or below the one before it (`previous`), read now. Deleting a file
 * that is gone does nothing. Returns how many files it asked R2 to delete.
 */
export async function dropRenders(
  ctx: RecutContext,
  episodeId: Uuid,
  below: 'current' | 'previous',
): Promise<number> {
  const episode = await episodes.get(ctx.db, episodeId);
  if (!episode) return 0;
  const limit = below === 'current' ? episode.renderVersion : episode.renderVersion - 1;
  const old = (await renders.forEpisode(ctx.db, episodeId)).filter(
    (r) => r.state === 'done' && r.renderVersion < limit,
  );
  for (const row of old) await ctx.media.delete(row.outKey);
  return old.length;
}

/**
 * The undo, as one D1 batch whose statements all apply only while `runId` holds the claim: the published
 * plan stored again as the next version (`revert`) unless it is already the current plan, the episode
 * pointed at it, its open requests closed and the claim released as `failed`. A clash with an edit
 * landing at the same moment throws, and a retry stores the revert at the next version.
 */
export async function revertRecut(
  ctx: RecutContext,
  episodeId: Uuid,
  runId: string,
): Promise<'reverted' | 'gone'> {
  const episode = await episodes.get(ctx.db, episodeId);
  if (!episode) return 'gone';
  const now = ctx.clock.now();
  const published = await publishedPlan(ctx, episode);
  const statements = [];
  let pointAt: { version: number; summary: string } | undefined;
  if (published && published.version !== episode.planVersion) {
    const version = episode.planVersion + 1;
    statements.push(
      plans.insert(
        ctx.db,
        { episodeId, version, plan: published.plan, createdBy: 'revert', createdAt: now },
        { whileRun: runId },
      ),
    );
    pointAt = { version, summary: published.plan.summary };
  }
  statements.push(
    ...originalRequests.closeAllWhileRun(ctx.db, episodeId, runId, now),
    ...episodes.failRecut(ctx.db, episodeId, runId, now, pointAt),
  );
  await ctx.db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  return 'reverted';
}
