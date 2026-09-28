// The render steps (P15, D41) as plain functions, so they run without a Workflow. The input is rebuilt
// from what is stored each time, so a moment deleted or made local-only since planning is never drawn
// (rule 8). Only ids and outcomes leave a step; no manifest or URL is logged.
import type { Episode, EpisodeRender, RenderManifestV2, Timestamp, Uuid } from '@life/contracts';
import {
  answerWords,
  episodeTimeline,
  weekBrief,
  type TimelineMoment,
  type TimelineNarration,
} from '@life/story';
import { database, type Db } from '../../data/db';
import { episodeKey, mediaKey } from '../../data/mediaKeys';
import { briefInput } from '../../data/repositories/brief';
import * as costLedger from '../../data/repositories/costLedger';
import * as documentaries from '../../data/repositories/documentaries';
import * as episodes from '../../data/repositories/episodes';
import * as narration from '../../data/repositories/narration';
import * as plans from '../../data/repositories/plans';
import * as renders from '../../data/repositories/renders';
import * as week from '../../data/repositories/week';
import { episodeCostCents, renderMicroUsd } from '../../policy/costs';
import { pipelineProviders } from '../../providers';
import type { Env } from '../../shared/env';
import type { Renderer } from '../ports';
import { mediaUrl } from './mediaUrl';
import { MAX_INPUT_BYTES, PHOTO_TYPES, RENDER_COMPOSITION, RENDER_OPTIONS } from './settings';

export type RenderFormat = EpisodeRender['format'];

export type RenderContext = {
  db: Db;
  media: R2Bucket;
  renderer: Renderer;
  env: Pick<Env, 'R2_BUCKET' | 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY'>;
  clock: { now(): Timestamp };
};

export function renderContext(env: Env): RenderContext {
  return {
    db: database(env.DB),
    media: env.MEDIA,
    renderer: pipelineProviders(env).renderer,
    env,
    clock: { now: () => new Date().toISOString() },
  };
}

export const INPUT_TOO_LARGE = 'The render input is too large';

const MEDIA_TYPE = { video: 'video', audio: 'voice', photo: 'photo' } as const;

/** Every moment the plan shows. */
export function planMomentIds(
  plan: NonNullable<Awaited<ReturnType<typeof plans.current>>>['plan'],
) {
  return new Set([
    plan.coldOpen.momentId,
    ...plan.scenes.flatMap((s) => s.shots.map((shot) => shot.momentId)),
    plan.closing.momentId,
  ]);
}

/**
 * The episode as the renderer draws it, from the stored plan and what may still leave the phone, or
 * `null` when nothing is left to show. Every source is a presigned URL under the owner's prefix. With
 * `planVersion`, it draws that version with that version's narration instead of the current plan.
 */
export async function renderInput(
  ctx: RenderContext,
  episode: Episode,
  format: RenderFormat,
  planVersion?: number,
): Promise<RenderManifestV2 | null> {
  const stored =
    planVersion === undefined
      ? await plans.current(ctx.db, episode.id)
      : await plans.get(ctx.db, episode.id, planVersion);
  const documentary = await documentaries.get(ctx.db, episode.documentaryId);
  if (!stored || !documentary) return null;
  const owner = { userId: documentary.ownerUserId, documentaryId: documentary.id };

  // The brief applies `leavesDevice` again: a moment deleted or made local-only since planning is gone.
  const input = await briefInput(ctx.db, episode);
  const brief = weekBrief(input);
  const briefMoments = new Map(brief.moments.map((m) => [m.momentId, m]));
  const assets = new Map(
    (await week.momentsOfWeek(ctx.db, episode.documentaryId, episode.weekStart)).flatMap(
      ({ moment, asset }) => (asset ? [[moment.id, asset] as const] : []),
    ),
  );
  const transcripts = new Map(
    input.derived.filter((d) => d.provider === 'workersAi').map((d) => [d.momentId, d]),
  );

  const moments: TimelineMoment[] = [];
  for (const momentId of planMomentIds(stored.plan)) {
    const moment = briefMoments.get(momentId);
    const asset = assets.get(momentId);
    if (!moment || !asset) continue;
    if (moment.kind !== 'answer' && moment.kind !== 'clip' && moment.kind !== 'photo') continue;
    const key = mediaKey(asset.ownerUserId, episode.documentaryId, asset.id, 'original');
    const head = await ctx.media.head(key);
    if (!head) continue;
    if (asset.kind === 'photo' && !PHOTO_TYPES.includes(head.httpMetadata?.contentType ?? '')) {
      continue;
    }
    const durationMs = asset.durationMs;
    const words =
      moment.kind === 'answer' && durationMs !== undefined
        ? answerWords(transcripts.get(momentId), durationMs)
        : undefined;
    moments.push({
      momentId,
      kind: moment.kind,
      media: {
        type: MEDIA_TYPE[asset.kind],
        src: await mediaUrl(ctx.env, owner, key),
        ...(durationMs !== undefined ? { durationMs } : {}),
      },
      ...(moment.questionText !== undefined ? { question: moment.questionText } : {}),
      ...(words && words.words.length > 0 ? { words } : {}),
    });
  }

  const clips = (await narration.forEpisode(ctx.db, episode.id, stored.version)).filter(
    (c) => c.kept,
  );
  const narrated: TimelineNarration[] = [];
  for (const clip of clips) {
    narrated.push({
      kind: clip.kind,
      ...(clip.sceneIndex !== undefined ? { sceneIndex: clip.sceneIndex } : {}),
      src: await mediaUrl(ctx.env, owner, clip.key),
      durationMs: clip.durationMs,
      words: clip.words,
    });
  }

  return episodeTimeline({
    plan: stored.plan,
    format,
    moments,
    cast: brief.cast.map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.relation !== undefined ? { relation: c.relation } : {}),
    })),
    storylines: brief.storylines,
    episodeNumber: episode.number,
    weekStart: episode.weekStart,
    weekEnd: episode.weekEnd,
    narration: narrated,
  });
}

export type StartResult =
  { outcome: 'nothing' } | { outcome: 'stale' } | { outcome: 'started'; id: Uuid };

/**
 * Starts one render of the episode's current plan in this shape. A render of the same plan version and
 * shape that is running or done is returned with no call; one left `starting` is started again. With
 * `planVersion` (a re-cut, P17), a version that is no longer the current plan gives `stale`. The version
 * is read once, so an edit landing during a start can't mix two versions.
 */
export async function startRender(
  ctx: RenderContext,
  episodeId: Uuid,
  format: RenderFormat,
  planVersion?: number,
): Promise<StartResult> {
  const episode = await episodes.get(ctx.db, episodeId);
  const documentary = episode ? await documentaries.get(ctx.db, episode.documentaryId) : null;
  if (!episode || !documentary || episode.planVersion < 1) return { outcome: 'nothing' };
  const version = planVersion ?? episode.planVersion;
  if (version !== episode.planVersion) return { outcome: 'stale' };
  const rows = await renders.forEpisode(ctx.db, episode.id);
  const same = rows.filter((r) => r.planVersion === version && r.format === format);
  const running = same.find((r) => r.state === 'rendering' || r.state === 'done');
  if (running) return { outcome: 'started', id: running.id };
  if (format === 'landscape' && episode.renderVersion === 0) return { outcome: 'nothing' };

  const manifest = await renderInput(ctx, episode, format, version);
  if (!manifest) return { outcome: 'nothing' };
  if (new TextEncoder().encode(JSON.stringify(manifest)).byteLength > MAX_INPUT_BYTES) {
    throw new Error(INPUT_TOO_LARGE);
  }

  // A 9:16 render takes the next version; a 16:9 export draws the episode's current one.
  const left = same.find((r) => r.state === 'starting');
  const renderVersion =
    left?.renderVersion ??
    (format === 'portrait'
      ? 1 + Math.max(0, ...rows.filter((r) => r.format === 'portrait').map((r) => r.renderVersion))
      : episode.renderVersion);
  // A failed export of this version is started again in its own row (the version and shape are unique).
  const reused = left ?? rows.find((r) => r.format === format && r.renderVersion === renderVersion);
  const outKey = episodeKey(
    documentary.ownerUserId,
    documentary.id,
    episode.id,
    renderVersion,
    format,
  );
  const row = await renders.put(ctx.db, {
    id: reused?.id ?? (crypto.randomUUID() as Uuid),
    episodeId: episode.id,
    planVersion: version,
    renderVersion,
    format,
    outKey,
    durationMs: manifest.durationMs,
    state: 'starting',
    startedAt: ctx.clock.now(),
  });
  const started = await ctx.renderer.start({
    manifest,
    composition: RENDER_COMPOSITION,
    outKey,
    options: RENDER_OPTIONS,
  });
  await renders.setState(ctx.db, row.id, {
    state: 'rendering',
    vendorRenderId: started.renderId,
    bucket: started.bucketName,
  });
  return { outcome: 'started', id: row.id };
}

export type CheckResult = { outcome: 'starting' | 'rendering' | 'done' | 'failed' | 'gone' };

/** The episode's render ledger row over every render with a cost, then the episode's cents. */
async function recordRenderCosts(ctx: RenderContext, episodeId: Uuid): Promise<void> {
  const at = ctx.clock.now();
  const costs = (await renders.forEpisode(ctx.db, episodeId)).flatMap((r) =>
    r.costMicroUsd !== undefined ? [r.costMicroUsd] : [],
  );
  if (costs.length > 0) {
    await costLedger.upsert(ctx.db, {
      episodeId,
      step: 'render',
      provider: 'remotionLambda',
      unit: 'render',
      units: costs.length,
      microUsd: costs.reduce((sum, c) => sum + c, 0),
      at,
    });
  }
  const cents = episodeCostCents(await costLedger.forEpisode(ctx.db, episodeId));
  await episodes.setCostCents(ctx.db, episodeId, cents, at);
}

/**
 * Points the episode at a finished portrait render and rewrites the render costs. Safe to run again:
 * `setRender` only moves forward and the cost row is rewritten from the renders.
 */
async function recordDone(
  ctx: RenderContext,
  row: Pick<EpisodeRender, 'episodeId' | 'format' | 'renderVersion' | 'outKey' | 'durationMs'>,
  now: Timestamp,
): Promise<void> {
  if (row.format === 'portrait') {
    await episodes.setRender(
      ctx.db,
      row.episodeId,
      row.renderVersion,
      row.outKey,
      row.durationMs,
      now,
    );
  }
  await recordRenderCosts(ctx, row.episodeId);
}

/**
 * Asks how a render is going and records a finished one. A finished row answers without a call; a `done`
 * row writes the episode's render and costs again, so a check that stopped after marking the row done
 * still completes on the next one.
 */
export async function checkRender(ctx: RenderContext, id: Uuid): Promise<CheckResult> {
  const row = await renders.get(ctx.db, id);
  if (!row) return { outcome: 'gone' };
  if (row.state === 'failed') return { outcome: 'failed' };
  if (row.state === 'done') {
    await recordDone(ctx, row, ctx.clock.now());
    return { outcome: 'done' };
  }
  if (row.state === 'starting' || !row.vendorRenderId || !row.bucket) {
    return { outcome: 'starting' };
  }

  const progress = await ctx.renderer.progress({
    renderId: row.vendorRenderId,
    bucketName: row.bucket,
  });
  if (progress.state === 'rendering') return { outcome: 'rendering' };
  const now = ctx.clock.now();
  if (progress.state === 'failed') {
    await renders.setState(ctx.db, id, {
      state: 'failed',
      reason: progress.reason,
      finishedAt: now,
    });
    return { outcome: 'failed' };
  }
  await renders.setState(ctx.db, id, {
    state: 'done',
    ...(progress.costUsd !== undefined ? { costMicroUsd: renderMicroUsd(progress.costUsd) } : {}),
    finishedAt: now,
  });
  await recordDone(ctx, row, now);
  return { outcome: 'done' };
}
