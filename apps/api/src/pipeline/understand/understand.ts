// Step 1 of the episode pipeline (P12, D38) as plain functions, so they run without a Workflow. Only
// what `leavesDevice` allows is read, and only the working copies that are in R2; what is missing stays
// missing (rules 8 and 10). Every function returns ids, keys, kinds and counts, never file bytes.
import { Buffer } from 'node:buffer';
import { TranscriptSegment, type UploadPurpose, type Uuid } from '@life/contracts';
import { z } from 'zod';
import { mediaKey } from '../../data/mediaKeys';
import * as costLedger from '../../data/repositories/costLedger';
import * as derivedRepo from '../../data/repositories/derived';
import * as episodes from '../../data/repositories/episodes';
import * as week from '../../data/repositories/week';
import { keptCaption } from '../../policy/captions';
import { captionMicroUsd, episodeCostCents, transcribeMicroUsd } from '../../policy/costs';
import { uploadsAllowed } from '../../policy/leavesDevice';
import type { EpisodeRef, UnderstandContext } from './context';
import {
  CAPTION_MAX_TOKENS,
  CAPTION_MODEL,
  CAPTION_SYSTEM,
  CAPTION_USER_TEXT,
  CHUNK_MAX_BYTES,
  CHUNK_MAX_IMAGES,
  IMAGE_MAX_BYTES,
  SEGMENTS_MAX,
  SEGMENT_TEXT_MAX,
  SEGMENT_WORDS_MAX,
  TRANSCRIBE_MODEL,
  TRANSCRIPT_MAX,
  WORD_TEXT_MAX,
} from './settings';
import type { TimedSegment, TimedWord } from '../ports';

/** One working copy found in R2. */
export type WorkingCopy = {
  momentId: Uuid;
  assetId: Uuid;
  purpose: UploadPurpose;
  key: string;
  contentType: string;
  bytes: number;
  /** The asset's duration, for an answer Whisper gives no duration for. */
  durationMs?: number;
};

export type Inventory = {
  /** Answers to transcribe. */
  answers: WorkingCopy[];
  /** Photo previews and video keyframes to caption. */
  images: WorkingCopy[];
  /** Every working copy the run looked at; all are deleted when the text steps end. */
  keys: string[];
};

const IMAGE_PURPOSES = new Set<UploadPurpose>(['preview', 'keyframe']);

/** The week's moments that may leave the phone and the working copies of theirs that are in R2. */
export async function inventory(ctx: UnderstandContext, episode: EpisodeRef): Promise<Inventory> {
  const found: Inventory = { answers: [], images: [], keys: [] };
  for (const { moment, asset } of await week.momentsOfWeek(
    ctx.db,
    episode.documentaryId,
    episode.weekStart,
  )) {
    if (!asset) continue;
    // The server applies the rule again (rule 8): a local-only moment gives nothing.
    for (const purpose of uploadsAllowed(moment, asset.kind, { requested: false })) {
      if (purpose === 'original') continue;
      const key = mediaKey(asset.ownerUserId, episode.documentaryId, asset.id, purpose);
      const head = await ctx.media.head(key);
      if (!head) continue;
      const copy: WorkingCopy = {
        momentId: moment.id,
        assetId: asset.id,
        purpose,
        key,
        contentType: head.httpMetadata?.contentType ?? 'application/octet-stream',
        bytes: head.size,
        ...(asset.durationMs !== undefined ? { durationMs: asset.durationMs } : {}),
      };
      found.keys.push(key);
      if (purpose === 'answer') found.answers.push(copy);
      else if (IMAGE_PURPOSES.has(purpose)) found.images.push(copy);
    }
  }
  return found;
}

const Segments = z.array(TranscriptSegment).max(SEGMENTS_MAX);

/**
 * The timed transcript as it may be stored: texts cut to their limits, at most 200 segments of 60
 * words, times clamped to the answer's length when it is known, and every piece whose end is not after
 * its start dropped. None when nothing is left or it still does not parse; the transcript is never lost
 * because of its timings.
 */
export function keptSegments(
  segments: readonly TimedSegment[] | undefined,
  durationMs: number | undefined,
): TranscriptSegment[] | undefined {
  if (!segments) return undefined;
  const clamp = (ms: number) =>
    Math.max(0, durationMs === undefined ? ms : Math.min(ms, durationMs));
  const piece = (p: TimedWord, max: number): TimedWord | undefined => {
    const text = p.text.slice(0, max);
    const startMs = clamp(p.startMs);
    const endMs = clamp(p.endMs);
    return text !== '' && endMs > startMs ? { text, startMs, endMs } : undefined;
  };
  const kept = segments.flatMap((s) => {
    const segment = piece(s, SEGMENT_TEXT_MAX);
    if (!segment) return [];
    const words = (s.words ?? [])
      .flatMap((w) => piece(w, WORD_TEXT_MAX) ?? [])
      .slice(0, SEGMENT_WORDS_MAX);
    return [words.length > 0 ? { ...segment, words } : segment];
  });
  const parsed = Segments.safeParse(kept.slice(0, SEGMENTS_MAX));
  return parsed.success && parsed.data.length > 0 ? parsed.data : undefined;
}

/**
 * Transcribes one answer and stores its `workersAi` row (text cut to 4,000 characters, the detected
 * language or `und`); an empty transcript stores nothing. Returns the seconds Whisper heard, or the
 * asset's duration when it reports none; 0 when the copy is gone.
 */
export async function transcribeAnswer(
  ctx: UnderstandContext,
  episode: EpisodeRef,
  item: WorkingCopy,
): Promise<number> {
  const object = await ctx.media.get(item.key);
  if (!object) return 0;
  const heard = await ctx.transcriber.transcribe({
    model: TRANSCRIBE_MODEL,
    body: object.body as ReadableStream<Uint8Array>,
    contentType: item.contentType,
  });
  const text = heard.text.trim();
  if (text !== '' && (await week.isLive(ctx.db, episode.documentaryId, item.momentId))) {
    const segments = keptSegments(heard.segments, item.durationMs);
    await derivedRepo.upsert(ctx.db, episode.documentaryId, {
      momentId: item.momentId,
      transcript: text.slice(0, TRANSCRIPT_MAX),
      ...(segments ? { segments } : {}),
      language: heard.language ?? 'und',
      provider: 'workersAi',
      modelVersion: TRANSCRIBE_MODEL,
      producedAt: ctx.clock.now(),
    });
  }
  return heard.seconds ?? (item.durationMs ?? 0) / 1000;
}

/** Splits the images into batches of at most 100 images and 12 MB; an image over 1.5 MB is skipped. */
export function captionChunks<T extends { bytes: number }>(items: readonly T[]): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    if (item.bytes > IMAGE_MAX_BYTES) continue;
    if (current.length === CHUNK_MAX_IMAGES || bytes + item.bytes > CHUNK_MAX_BYTES) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += item.bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Reads the chunk's images and sends one batch; null when none of them could be read. */
export async function submitCaptions(
  ctx: UnderstandContext,
  chunk: readonly WorkingCopy[],
): Promise<string | null> {
  const items: { id: string; jpegBase64: string }[] = [];
  for (const image of chunk) {
    const object = await ctx.media.get(image.key);
    if (!object) continue;
    items.push({
      id: image.momentId,
      jpegBase64: Buffer.from(await object.arrayBuffer()).toString('base64'),
    });
  }
  if (items.length === 0) return null;
  return ctx.captioner.submit(items, {
    model: CAPTION_MODEL,
    system: CAPTION_SYSTEM,
    userText: CAPTION_USER_TEXT,
    maxTokens: CAPTION_MAX_TOKENS,
  });
}

export type CaptionUsage = {
  kept: number;
  dropped: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Reads the ended batches: a caption the policy keeps becomes the moment's `anthropic` row (language
 * `en`); every result's tokens are counted, kept or not.
 */
export async function readCaptions(
  ctx: UnderstandContext,
  episode: EpisodeRef,
  batchIds: readonly string[],
  momentIds: readonly string[],
): Promise<CaptionUsage> {
  const asked = new Set(momentIds);
  const usage: CaptionUsage = { kept: 0, dropped: 0, inputTokens: 0, outputTokens: 0 };
  for (const batchId of batchIds) {
    for await (const result of ctx.captioner.results(batchId)) {
      usage.inputTokens += result.inputTokens;
      usage.outputTokens += result.outputTokens;
      const caption =
        result.outcome === 'succeeded' ? keptCaption(result.text, result.stopReason) : null;
      if (
        caption === null ||
        !asked.has(result.id) ||
        !(await week.isLive(ctx.db, episode.documentaryId, result.id))
      ) {
        usage.dropped += 1;
        continue;
      }
      await derivedRepo.upsert(ctx.db, episode.documentaryId, {
        momentId: result.id as Uuid,
        caption,
        language: 'en',
        provider: 'anthropic',
        modelVersion: CAPTION_MODEL,
        producedAt: ctx.clock.now(),
      });
      usage.kept += 1;
    }
  }
  return usage;
}

/** The batches of `batchIds` that have not ended yet. */
export async function unfinished(
  ctx: UnderstandContext,
  batchIds: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const id of batchIds) if ((await ctx.captioner.status(id)) !== 'ended') out.push(id);
  return out;
}

/**
 * Deletes each ended caption batch on its own: a failure is logged by id and the others go on, and a
 * batch already deleted counts as deleted, so the step can run again. Returns how many were deleted.
 */
export async function removeCaptionBatches(
  ctx: UnderstandContext,
  batchIds: readonly string[],
): Promise<number> {
  let removed = 0;
  for (const id of batchIds) {
    try {
      await ctx.captioner.remove(id);
      removed += 1;
    } catch (error) {
      console.error(`Caption batch ${id} could not be deleted.`, error);
    }
  }
  return removed;
}

/** Deletes the working copies the run looked at. */
export async function removeWorkingCopies(
  ctx: UnderstandContext,
  keys: readonly string[],
): Promise<number> {
  for (let i = 0; i < keys.length; i += 1000) await ctx.media.delete(keys.slice(i, i + 1000));
  return keys.length;
}

export type Usage = { seconds: number; inputTokens: number; outputTokens: number };

/**
 * Records what the step cost: one ledger row per unit that was used (audio seconds rounded up), then
 * the episode's cents from all its rows.
 */
export async function recordCosts(
  ctx: UnderstandContext,
  episode: EpisodeRef,
  usage: Usage,
): Promise<number> {
  const at = ctx.clock.now();
  const audioSeconds = Math.ceil(usage.seconds);
  const rows = [
    {
      step: 'transcribe',
      provider: 'workersAi',
      unit: 'audioSecond',
      units: audioSeconds,
      microUsd: transcribeMicroUsd(audioSeconds),
    },
    {
      step: 'caption',
      provider: 'anthropic',
      unit: 'inputToken',
      units: usage.inputTokens,
      microUsd: captionMicroUsd(usage.inputTokens, 0),
    },
    {
      step: 'caption',
      provider: 'anthropic',
      unit: 'outputToken',
      units: usage.outputTokens,
      microUsd: captionMicroUsd(0, usage.outputTokens),
    },
  ] as const;
  for (const row of rows) {
    if (row.units > 0) await costLedger.upsert(ctx.db, { ...row, episodeId: episode.id, at });
  }
  const cents = episodeCostCents(await costLedger.forEpisode(ctx.db, episode.id));
  await episodes.setCostCents(ctx.db, episode.id, cents, at);
  return cents;
}
