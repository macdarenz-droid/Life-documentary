import type { Uuid } from '@life/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import type { EpisodeRef, UnderstandContext } from '../src/pipeline/understand/context';
import {
  captionChunks,
  inventory,
  readCaptions,
  recordCosts,
  removeWorkingCopies,
  submitCaptions,
  transcribeAnswer,
  unfinished,
} from '../src/pipeline/understand/understand';
import { MB } from '../src/pipeline/understand/settings';
import { CAPTION_BANNED_WORDS, keptCaption } from '../src/policy/captions';
import { fixtures } from '../src/providers/fixture';
import { bindings } from './session';
import { WEEK, seedDocumentary } from './understandSeed';

const context = (): UnderstandContext => ({
  db: seedDb(),
  media: bindings.MEDIA,
  transcriber: fixtures.transcriber,
  captioner: fixtures.captioner,
  clock: { now: () => '2027-03-21T18:00:00.000Z' },
});
let seedDb: () => UnderstandContext['db'];

/** The understanding step's functions in the Workflow's order, without the Workflow. */
async function understand(ctx: UnderstandContext, episode: EpisodeRef) {
  const found = await inventory(ctx, episode);
  const sent: string[] = [];
  for (const chunk of captionChunks(found.images)) {
    const id = await submitCaptions(ctx, chunk);
    if (id) sent.push(id);
  }
  let seconds = 0;
  for (const answer of found.answers) seconds += await transcribeAnswer(ctx, episode, answer);
  const pending = await unfinished(ctx, sent);
  const ended = sent.filter((id) => !pending.includes(id));
  const usage = await readCaptions(
    ctx,
    episode,
    ended,
    found.images.map((i) => i.momentId),
  );
  await removeWorkingCopies(ctx, found.keys);
  const cents = await recordCosts(ctx, episode, { seconds, ...usage });
  return { found, usage, seconds, cents };
}

async function setup() {
  const seed = await seedDocumentary();
  seedDb = () => seed.db;
  const ctx = context();
  const stored = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, ctx.clock.now());
  const episode: EpisodeRef = {
    id: stored.id,
    documentaryId: stored.documentaryId,
    weekStart: stored.weekStart,
  };
  return { seed, ctx, episode };
}

beforeEach(() => fixtures.reset());

describe('understanding a week', () => {
  it('transcribes two answers, captions three images and deletes every working copy', async () => {
    const { seed, ctx, episode } = await setup();
    const week = await seed.fullWeek();
    const { usage, cents } = await understand(ctx, episode);

    const rows = await seed.derivedRows();
    const transcripts = rows.filter((r) => r.provider === 'workersAi').map((r) => r.momentId);
    const captions = rows.filter((r) => r.provider === 'anthropic').map((r) => r.momentId);
    expect(transcripts.sort()).toEqual(
      [week.videoAnswer.momentId, week.voiceAnswer.momentId].sort(),
    );
    expect(captions.sort()).toEqual(
      [week.videoAnswer.momentId, week.photo.momentId, week.clip.momentId].sort(),
    );
    expect(usage.kept).toBe(3);
    expect(fixtures.transcriber.calls.map((c) => c.contentType).sort()).toEqual([
      'audio/mp4',
      'video/quicktime',
    ]);
    const [batch] = [...fixtures.captioner.batches.values()];
    expect(batch?.request.model).toBe('claude-haiku-4-5-20251001');
    expect(batch?.request.maxTokens).toBe(200);
    expect(batch?.request.userText).toBe('Describe this photo.');
    expect(await seed.workingCopies()).toEqual([]);
    // 18 s of audio, 3 × 972 input and 3 × 14 output tokens.
    expect(await costLedger.forEpisode(seed.db, episode.id)).toMatchObject([
      { step: 'caption', unit: 'inputToken', units: 2916, microUsd: 1458 },
      { step: 'caption', unit: 'outputToken', units: 42, microUsd: 105 },
      { step: 'transcribe', unit: 'audioSecond', units: 18, microUsd: 154 },
    ]);
    expect(cents).toBe(1);
    expect((await episodes.get(seed.db, episode.id))?.costCents).toBe(1);
  });

  it('never sends a local-only moment or one from another week to a provider', async () => {
    const { seed, ctx, episode } = await setup();
    const kept = await seed.add('voiceAnswer', { localOnly: true });
    const keptPhoto = await seed.add('photo', { localOnly: true });
    const lastWeek = await seed.add('voiceAnswer', { capturedAt: '2027-03-14T21:30:00.000Z' });
    const lastWeekPhoto = await seed.add('photo', { capturedAt: '2027-03-08T10:00:00.000Z' });
    const inWeek = await seed.add('voiceAnswer');
    for (const s of [kept, lastWeek, inWeek]) await seed.upload(s, 'answer');
    for (const s of [keptPhoto, lastWeekPhoto]) await seed.upload(s, 'preview');

    const { found } = await understand(ctx, episode);
    expect(found.answers.map((a) => a.momentId)).toEqual([inWeek.momentId]);
    expect(found.images).toEqual([]);
    expect(fixtures.transcriber.calls).toHaveLength(1);
    expect(fixtures.captioner.calls.filter((c) => c.startsWith('submit'))).toEqual([]);
    expect((await seed.derivedRows()).map((r) => r.momentId)).toEqual([inWeek.momentId]);
  });

  it('makes no call and no row for an answer whose copy is not in R2', async () => {
    const { seed, ctx, episode } = await setup();
    await seed.add('voiceAnswer');
    await understand(ctx, episode);
    expect(fixtures.transcriber.calls).toEqual([]);
    expect(await seed.derivedRows()).toEqual([]);
    expect(await costLedger.forEpisode(seed.db, episode.id)).toEqual([]);
  });

  it('writes nothing for an empty transcript', async () => {
    const { seed, ctx, episode } = await setup();
    await seed.upload(await seed.add('voiceAnswer'), 'answer');
    fixtures.transcriber.answer = { text: '   ' };
    const { seconds } = await understand(ctx, episode);
    expect(fixtures.transcriber.calls).toHaveLength(1);
    expect(await seed.derivedRows()).toEqual([]);
    // No duration from the model: the asset's own 9 s count.
    expect(seconds).toBe(9);
  });

  it('keeps one row per moment and provider and the same costs when the week runs again', async () => {
    const { seed, ctx, episode } = await setup();
    const week = await seed.fullWeek();
    const first = await understand(ctx, episode);
    const rowsBefore = await seed.derivedRows();
    const ledgerBefore = await costLedger.forEpisode(seed.db, episode.id);

    for (const [s, purpose] of [
      [week.videoAnswer, 'answer'],
      [week.videoAnswer, 'keyframe'],
      [week.voiceAnswer, 'answer'],
      [week.photo, 'preview'],
      [week.clip, 'keyframe'],
    ] as const)
      await seed.upload(s, purpose);
    const second = await understand(ctx, episode);

    expect(await seed.derivedRows()).toEqual(rowsBefore);
    expect(rowsBefore).toHaveLength(5);
    expect(await costLedger.forEpisode(seed.db, episode.id)).toEqual(ledgerBefore);
    expect(second.cents).toBe(first.cents);
  });

  it('writes no caption for a moment deleted before the captions are read', async () => {
    const { seed, ctx, episode } = await setup();
    const photo = await seed.add('photo');
    await seed.upload(photo, 'preview');
    const found = await inventory(ctx, episode);
    const [chunk] = captionChunks(found.images);
    const batch = await submitCaptions(ctx, chunk!);
    await bindings.DB.prepare('UPDATE moments SET deleted_at = ? WHERE id = ?')
      .bind('2027-03-20T10:00:00.000Z', photo.momentId)
      .run();
    const usage = await readCaptions(ctx, episode, [batch!], [photo.momentId]);
    expect(usage).toMatchObject({ kept: 0, dropped: 1, inputTokens: 972 });
    expect(await seed.derivedRows()).toEqual([]);
  });
});

describe('captionChunks', () => {
  const images = (n: number, bytes: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `m${i}` as Uuid, bytes }));

  it('splits 250 images of 100 KB into chunks of 100, 100 and 50', () => {
    expect(captionChunks(images(250, 100 * 1024)).map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it('splits 30 images of 1 MB by bytes into 12, 12 and 6', () => {
    expect(captionChunks(images(30, MB)).map((c) => c.length)).toEqual([12, 12, 6]);
  });

  it('skips an image over 1.5 MB', () => {
    const chunks = captionChunks([...images(2, MB), { id: 'big' as Uuid, bytes: 2 * MB }]);
    expect(chunks.flat().map((i) => i.id)).toEqual(['m0', 'm1']);
  });
});

describe('keptCaption', () => {
  const ok = 'A person holding a cake at a kitchen table.';

  it('keeps a plain caption, trimmed', () => {
    expect(keptCaption(`  ${ok} `, 'end_turn')).toBe(ok);
  });

  it.each(CAPTION_BANNED_WORDS)('drops a caption with "%s"', (word) => {
    expect(keptCaption(`A person and ${word} by a window.`, 'end_turn')).toBeNull();
    expect(keptCaption(`${word.toUpperCase()} at the door.`, 'end_turn')).toBeNull();
  });

  it('keeps words that only contain a listed one', () => {
    expect(keptCaption('A person on a shed roof at the harbour.', 'end_turn')).toBe(
      'A person on a shed roof at the harbour.',
    );
  });

  it('drops unclear, an empty text, a stop other than end_turn, and an over-long text', () => {
    expect(keptCaption('unclear', 'end_turn')).toBeNull();
    expect(keptCaption('Unclear.', 'end_turn')).toBeNull();
    expect(keptCaption('  ', 'end_turn')).toBeNull();
    expect(keptCaption(ok, 'max_tokens')).toBeNull();
    expect(keptCaption(ok, 'refusal')).toBeNull();
    expect(keptCaption(undefined, 'end_turn')).toBeNull();
    expect(keptCaption(`A person ${'walking '.repeat(40)}`, 'end_turn')).toBeNull();
  });
});
