// Step 3 of the episode pipeline (P14, D40) as plain functions, so they run without a Workflow. Each reads
// the stored plan from D1 itself; only outcomes, indices and counts leave a step, never audio or text.
import type { Episode, EpisodePlanV1, Timestamp } from '@life/contracts';
import { fitNarration, lineWords, narrationLines, speakable, weekBrief } from '@life/story';
import { database, type Db } from '../../data/db';
import { narrationKey } from '../../data/mediaKeys';
import { briefInput } from '../../data/repositories/brief';
import * as costLedger from '../../data/repositories/costLedger';
import * as documentaries from '../../data/repositories/documentaries';
import * as episodes from '../../data/repositories/episodes';
import * as narration from '../../data/repositories/narration';
import * as plans from '../../data/repositories/plans';
import { episodeCostCents, narrateMicroUsd } from '../../policy/costs';
import { pipelineProviders } from '../../providers';
import type { Env } from '../../shared/env';
import type { Narrator } from '../ports';
import { NARRATE_FORMAT, NARRATE_LANGUAGE, NARRATE_MODEL, vendorVoice } from './settings';

export type NarrateContext = {
  db: Db;
  media: R2Bucket;
  narrator: Narrator;
  env: Pick<Env, 'NARRATOR_VOICES'>;
  clock: { now(): Timestamp };
};

export function narrateContext(env: Env): NarrateContext {
  return {
    db: database(env.DB),
    media: env.MEDIA,
    narrator: pipelineProviders(env).narrator,
    env,
    clock: { now: () => new Date().toISOString() },
  };
}

export type LinesResult = { planVersion: number; indices: number[] };

export type LineResult =
  | { outcome: 'skipped' | 'reused' | 'gone' }
  | { outcome: 'spoken' | 'no-alignment'; characters: number };

/** The episode and its plan at this version; null when either is gone (a replay after a removal). */
async function planOf(
  ctx: NarrateContext,
  episodeId: Episode['id'],
  planVersion: number,
): Promise<{ episode: Episode; plan: EpisodePlanV1 } | null> {
  const episode = await episodes.get(ctx.db, episodeId);
  if (!episode) return null;
  const stored = await plans.current(ctx.db, episodeId);
  if (!stored || stored.version !== planVersion) return null;
  return { episode, plan: stored.plan };
}

/** SHA-256 hex of what makes a clip: the vendor voice, the model, the format and the text. */
async function clipHash(voiceId: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([voiceId, NARRATE_MODEL, NARRATE_FORMAT, text]),
  );
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The indices of the lines to speak; none unless the episode is waiting for narration. */
export async function linesStep(
  ctx: NarrateContext,
  episodeId: Episode['id'],
): Promise<LinesResult> {
  const episode = await episodes.get(ctx.db, episodeId);
  if (!episode || episode.state !== 'narrating') {
    return { planVersion: episode?.planVersion ?? 0, indices: [] };
  }
  const found = await planOf(ctx, episodeId, episode.planVersion);
  if (!found) return { planVersion: episode.planVersion, indices: [] };
  return {
    planVersion: episode.planVersion,
    indices: narrationLines(found.plan).map((line) => line.index),
  };
}

/**
 * Speaks one line, or reuses a stored clip with the same hash. A line with a digit is skipped without a
 * call, and an answer without a usable alignment stores nothing (missing stays missing).
 */
export async function lineStep(
  ctx: NarrateContext,
  episodeId: Episode['id'],
  planVersion: number,
  index: number,
): Promise<LineResult> {
  const found = await planOf(ctx, episodeId, planVersion);
  const line = found ? narrationLines(found.plan)[index] : undefined;
  if (!found || !line) return { outcome: 'gone' };
  if (!speakable(line.text)) {
    console.warn(`Narration line ${index} is not speakable; it is left out.`);
    return { outcome: 'skipped' };
  }
  const { episode, plan } = found;
  const ourVoice = plan.narratorVoiceId;
  if (!ourVoice) {
    console.warn(`Narration line ${index} has no narrator voice; it is left out.`);
    return { outcome: 'skipped' };
  }
  const voiceId = vendorVoice(ctx.env, ourVoice);
  const hash = await clipHash(voiceId, line.text);
  const clip = {
    episodeId: episode.id,
    planVersion,
    index,
    kind: line.kind,
    ...(line.sceneIndex !== undefined ? { sceneIndex: line.sceneIndex } : {}),
    text: line.text,
    voiceId: ourVoice,
    hash,
    kept: true,
    createdAt: ctx.clock.now(),
  };

  const stored = await narration.byHash(ctx.db, episode.id, hash);
  if (stored) {
    await narration.put(ctx.db, {
      ...clip,
      key: stored.key,
      durationMs: stored.durationMs,
      words: stored.words,
    });
    return { outcome: 'reused' };
  }

  const speech = await ctx.narrator.speak({
    voiceId,
    text: line.text,
    modelId: NARRATE_MODEL,
    outputFormat: NARRATE_FORMAT,
    languageCode: NARRATE_LANGUAGE,
  });
  const words = lineWords(line.text, speech.alignment);
  const lastEnd = speech.alignment?.endSeconds.at(-1);
  const durationMs = lastEnd === undefined ? 0 : Math.round(lastEnd * 1000);
  if (!words || durationMs < 1) return { outcome: 'no-alignment', characters: speech.characters };

  const documentary = await documentaries.get(ctx.db, episode.documentaryId);
  if (!documentary) return { outcome: 'gone' };
  const key = narrationKey(documentary.ownerUserId, documentary.id, episode.id, hash);
  await ctx.media.put(key, speech.audio, { httpMetadata: { contentType: 'audio/mpeg' } });
  await narration.put(ctx.db, { ...clip, key, durationMs, words });
  return { outcome: 'spoken', characters: speech.characters };
}

/** Keeps the narrator under a quarter of spoken time on the measured lengths; the episode goes to render. */
export async function fitStep(
  ctx: NarrateContext,
  episodeId: Episode['id'],
  planVersion: number,
): Promise<{ kept: number; dropped: number }> {
  const found = await planOf(ctx, episodeId, planVersion);
  if (!found) return { kept: 0, dropped: 0 };
  const { episode, plan } = found;
  const clips = await narration.forEpisode(ctx.db, episode.id, planVersion);
  const brief = weekBrief(await briefInput(ctx.db, episode));
  const kept = fitNarration(
    narrationLines(plan),
    new Map(clips.map((c) => [c.index, c.durationMs])),
    plan,
    brief,
  );
  await narration.setKept(ctx.db, episode.id, planVersion, kept);
  await episodes.setState(ctx.db, episode.id, 'rendering', ctx.clock.now());
  return { kept: kept.length, dropped: clips.length - kept.length };
}

/** The narrate ledger row over the characters ElevenLabs answered (none when 0), then the episode's cents. */
export async function recordNarrateCosts(
  ctx: NarrateContext,
  episodeId: Episode['id'],
  characters: number,
): Promise<number> {
  const at = ctx.clock.now();
  if (characters > 0) {
    await costLedger.upsert(ctx.db, {
      episodeId,
      step: 'narrate',
      provider: 'elevenlabs',
      unit: 'character',
      units: characters,
      microUsd: narrateMicroUsd(characters),
      at,
    });
  }
  const cents = episodeCostCents(await costLedger.forEpisode(ctx.db, episodeId));
  await episodes.setCostCents(ctx.db, episodeId, cents, at);
  return cents;
}
