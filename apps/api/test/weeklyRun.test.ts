import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  introspectWorkflowInstance,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { PlannerOutput, Uuid } from '@life/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src';
import { mediaKey } from '../src/data/mediaKeys';
import * as deletionRequests from '../src/data/repositories/deletionRequests';
import * as devicesRepo from '../src/data/repositories/devices';
import * as episodeRuns from '../src/data/repositories/episodeRuns';
import * as episodes from '../src/data/repositories/episodes';
import * as plans from '../src/data/repositories/plans';
import { episodeInstanceId, startEpisodePipeline } from '../src/pipeline/EpisodePipeline';
import { startDueWeeks } from '../src/pipeline/schedule';
import { fixtures } from '../src/providers/fixture';
import type { Env } from '../src/shared/env';
import { bindings } from './session';
import { WEEK, seedDocumentary, type Seeded } from './understandSeed';

beforeEach(() => fixtures.reset());

const PAST = { renderAt: '2020-01-05T16:45:00.000Z', deliverAt: '2020-01-05T17:00:00.000Z' };
const FUTURE = { renderAt: '2099-01-04T16:45:00.000Z', deliverAt: '2099-01-04T17:00:00.000Z' };
const T = '2027-03-21T06:00:00.000Z';
const TOKEN = 'ExponentPushToken[weekly]';
const usage = { inputTokens: 10, outputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0 };

type Seed = Awaited<ReturnType<typeof seedDocumentary>>;
type Week = Awaited<ReturnType<Seed['fullWeek']>>;
type Modifier = Parameters<
  Parameters<Awaited<ReturnType<typeof introspectWorkflowInstance>>['modify']>[0]
>[0];

/** A model plan over the full week; with `bridge`, the first scene has a narrator bridge. */
function modelAnswer(week: Week, bridge = true) {
  return {
    text: JSON.stringify(
      PlannerOutput.parse({
        title: 'Rain on the tram',
        coldOpen: { momentId: week.videoAnswer.momentId },
        scenes: [
          {
            heading: 'Wednesday',
            shots: [{ momentId: week.voiceAnswer.momentId }],
            ...(bridge ? { narratorBridge: { text: 'Wednesday, at home.' } } : {}),
          },
          { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
          { heading: 'Home again', shots: [{ momentId: week.clip.momentId }] },
        ],
        closing: { momentId: week.photo.momentId },
        musicMood: 'calm',
        lowerThirds: [],
        summary: 'They rode the tram and took a photo.',
      }),
    ),
    stopReason: 'end_turn',
    usage,
  };
}

async function withPhone(seed: Seed) {
  await devicesRepo.upsert(
    seed.db,
    seed.userId,
    { id: Uuid.parse(crypto.randomUUID()), platform: 'ios', appVersion: '1.0.0', pushToken: TOKEN },
    T,
  );
}

/** Runs the week with sleeps and retry delays off. */
async function runWeek(
  seed: Seed,
  times = PAST,
  extra: (m: Modifier) => Promise<void> = async () => {},
) {
  const id = episodeInstanceId(seed.documentaryId, WEEK);
  const instance = await introspectWorkflowInstance(bindings.EPISODE_PIPELINE, id);
  try {
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      await extra(m);
    });
    await startEpisodePipeline(bindings, seed.documentaryId, WEEK, times);
    await instance.waitForStatus('complete');
    return (await instance.getOutput()) as { outcome: string; plan: string };
  } finally {
    await instance.dispose();
  }
}

const episodeOf = (seed: Seed) => episodes.forWeek(seed.db, seed.documentaryId, WEEK);
const runOf = (seed: Seed) =>
  episodeRuns.get(seed.db, { documentaryId: seed.documentaryId, weekStart: WEEK });
const originalOf = (seed: Seed, seeded: Seeded) =>
  bindings.MEDIA.head(mediaKey(seed.userId, seed.documentaryId, seeded.assetId!, 'original'));

/** The visible pushes (the silent one asks for originals). */
const visible = () => fixtures.pusher.sent.filter((m) => !m.silent);

/** The media sources the first render drew. */
function renderedSources(index = 0): string {
  return JSON.stringify(fixtures.renderer.starts[index]?.manifest.segments ?? []);
}

describe('the weekly run', () => {
  it('delivers a model week with one push, every time recorded, the answers kept and no working copies', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    await withPhone(seed);
    fixtures.planner.answers.push(modelAnswer(week));
    const output = await runWeek(seed);
    expect(output).toMatchObject({ plan: 'model', outcome: 'model' });

    const episode = (await episodeOf(seed))!;
    expect(episode).toMatchObject({ state: 'ready', renderVersion: 1 });
    expect(episode.deliveredAt).toBeDefined();
    expect(visible()).toEqual([
      { to: TOKEN, title: 'Episode 1 is ready', data: { episodeId: episode.id }, silent: false },
    ]);
    expect(fixtures.pusher.sent.filter((m) => m.silent)).toEqual([
      { to: TOKEN, data: { type: 'originals' }, silent: true },
    ]);
    const run = (await runOf(seed))!;
    for (const field of [
      'startedAt',
      'understoodAt',
      'plannedAt',
      'narratedAt',
      'renderStartedAt',
      'deliveredAt',
    ] as const) {
      expect(run[field], field).not.toBeNull();
    }
    expect(run).toMatchObject({
      episodeId: episode.id,
      dueAt: PAST.deliverAt,
      outcome: 'model',
      originalsAsked: 2,
      originalsReceived: 0,
    });
    expect(await originalOf(seed, week.videoAnswer)).not.toBeNull();
    expect(await originalOf(seed, week.voiceAnswer)).not.toBeNull();
    expect(await seed.workingCopies()).toEqual([]);
  });

  it('delivers a week recapped at plan time with the outcome recap', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    fixtures.planner.answers.push(new Error('Overloaded'), new Error('Overloaded'));
    expect(await runWeek(seed)).toMatchObject({ plan: 'recap', outcome: 'recap' });
    expect(await episodeOf(seed)).toMatchObject({ state: 'ready' });
    expect((await runOf(seed))?.outcome).toBe('recap');
  });

  it('delivers a model plan with no bridge or tease without narration, outcome model', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push(modelAnswer(week, false));
    expect(await runWeek(seed)).toMatchObject({ outcome: 'model' });
    expect(fixtures.narrator.calls).toEqual([]);
    expect(await episodeOf(seed)).toMatchObject({ state: 'ready' });
    expect((await runOf(seed))?.narratedAt).toBeNull();
  });

  it('renders without waiting once every original arrived', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push(modelAnswer(week));
    const output = await runWeek(seed, FUTURE, async (m) => {
      await m.mockEvent({ type: 'originals-ready', payload: {} });
    });
    expect(output).toMatchObject({ outcome: 'model' });
    expect(fixtures.renderer.starts).toHaveLength(1);
    expect(await episodeOf(seed)).toMatchObject({ state: 'ready' });
  });

  it('renders with what arrived when the wait times out, leaving out the clip that never came', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    await bindings.MEDIA.put(
      mediaKey(seed.userId, seed.documentaryId, week.photo.assetId!, 'original'),
      new Uint8Array(100).fill(1),
      { httpMetadata: { contentType: 'image/jpeg' } },
    );
    fixtures.planner.answers.push(modelAnswer(week));
    const output = await runWeek(seed, FUTURE, async (m) => {
      await m.forceEventTimeout({ name: 'wait-originals' });
    });
    expect(output).toMatchObject({ outcome: 'model' });
    const drawn = renderedSources();
    expect(drawn).toContain(week.photo.assetId);
    expect(drawn).not.toContain(week.clip.assetId);
    expect((await runOf(seed))?.originalsAsked).toBe(1);
  });

  it('renders the recap as plan version 2 when the model render fails', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push(modelAnswer(week));
    fixtures.renderer.outcomes.push({ state: 'failed', reason: 'render failed' });
    expect(await runWeek(seed)).toMatchObject({ plan: 'model', outcome: 'recap' });
    const episode = (await episodeOf(seed))!;
    expect(episode).toMatchObject({ state: 'ready', planVersion: 2 });
    expect(await plans.current(seed.db, episode.id)).toMatchObject({
      version: 2,
      createdBy: 'recap',
    });
    expect((await runOf(seed))?.outcome).toBe('recap');
  });

  it('ends failed with no push when both renders fail', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    await withPhone(seed);
    fixtures.planner.answers.push(modelAnswer(week));
    fixtures.renderer.outcomes.push(
      { state: 'failed', reason: 'render failed' },
      { state: 'failed', reason: 'render timed out' },
    );
    expect(await runWeek(seed)).toMatchObject({ outcome: 'failed' });
    expect(await episodeOf(seed)).toMatchObject({ state: 'failed' });
    expect(visible()).toEqual([]);
    expect((await runOf(seed))?.outcome).toBe('failed');
  });

  it('logs one line with the episode id and no content when both renders fail', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push(modelAnswer(week));
    fixtures.renderer.outcomes.push(
      { state: 'failed', reason: 'render failed' },
      { state: 'failed', reason: 'render timed out' },
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await runWeek(seed)).toMatchObject({ outcome: 'failed' });
      const episode = (await episodeOf(seed))!;
      const lines = logged.mock.calls.filter((call) => JSON.stringify(call).includes(episode.id));
      expect(lines).toEqual([
        ['The week has no episode.', { episodeId: episode.id, render: 'failed' }],
      ]);
    } finally {
      logged.mockRestore();
    }
  });

  it('keeps a published episode ready with one push when run-record fails', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    await withPhone(seed);
    fixtures.planner.answers.push(modelAnswer(week));
    const output = await runWeek(seed, PAST, async (m) => {
      await m.mockStepError({ name: 'run-record' }, new Error('D1 is busy'));
    });
    expect(output).toMatchObject({ outcome: 'model' });
    expect(await episodeOf(seed)).toMatchObject({ state: 'ready' });
    expect(visible()).toHaveLength(1);
  });

  it('leaves a failed run row when the first step fails', async () => {
    const seed = await seedDocumentary();
    await seed.add('note');
    const output = await runWeek(seed, PAST, async (m) => {
      await m.mockStepError({ name: 'episode' }, new Error('D1 is busy'));
    });
    expect(output).toMatchObject({ outcome: 'failed' });
    expect(await runOf(seed)).toMatchObject({
      outcome: 'failed',
      episodeId: null,
      dueAt: PAST.deliverAt,
    });
  });

  it('records the delivery time when publish throws once after the episode moved', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    await withPhone(seed);
    for (const seeded of [week.photo, week.clip]) {
      await bindings.MEDIA.put(
        mediaKey(seed.userId, seed.documentaryId, seeded.assetId!, 'original'),
        new Uint8Array(100).fill(1),
        { httpMetadata: { contentType: seeded === week.photo ? 'image/jpeg' : 'video/mp4' } },
      );
    }
    fixtures.planner.answers.push(modelAnswer(week));
    // The push throws after setDelivered moved the episode; the retried publish moves nothing.
    fixtures.pusher.failures.push(new Error('Expo did not answer'));
    expect(await runWeek(seed)).toMatchObject({ outcome: 'model' });
    const episode = (await episodeOf(seed))!;
    expect(episode.deliveredAt).toBeDefined();
    expect((await runOf(seed))?.deliveredAt).toBe(episode.deliveredAt);
  });

  it('ends failed with no push when there is nothing to render, twice', async () => {
    const seed = await seedDocumentary();
    await withPhone(seed);
    const photo = await seed.add('photo');
    const clip = await seed.add('clip');
    await seed.upload(photo, 'preview');
    await seed.upload(clip, 'keyframe');
    expect(await runWeek(seed)).toMatchObject({ outcome: 'failed' });
    expect(fixtures.renderer.starts).toEqual([]);
    expect(await episodeOf(seed)).toMatchObject({ state: 'failed' });
    expect(visible()).toEqual([]);
  });

  it('gives the recap when narrate-lines fails', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push(modelAnswer(week));
    const output = await runWeek(seed, PAST, async (m) => {
      await m.mockStepError({ name: 'narrate-lines' }, new Error('D1 is busy'));
    });
    expect(output).toMatchObject({ outcome: 'recap' });
    expect(await episodeOf(seed)).toMatchObject({ state: 'ready', planVersion: 2 });
  });

  it('ends an empty week with no render, no push and a run record', async () => {
    const seed = await seedDocumentary();
    await seed.add('note');
    await withPhone(seed);
    expect(await runWeek(seed)).toMatchObject({ outcome: 'empty' });
    expect(fixtures.renderer.starts).toEqual([]);
    expect(fixtures.pusher.sent).toEqual([]);
    expect(await episodeOf(seed)).toBeNull();
    expect(await runOf(seed)).toMatchObject({ outcome: 'empty', episodeId: null });
  });

  it('sends one push when publish is replayed', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    await withPhone(seed);
    // Every original is there, so the only push is the visible one.
    for (const seeded of [week.photo, week.clip]) {
      await bindings.MEDIA.put(
        mediaKey(seed.userId, seed.documentaryId, seeded.assetId!, 'original'),
        new Uint8Array(100).fill(1),
        { httpMetadata: { contentType: seeded === week.photo ? 'image/jpeg' : 'video/mp4' } },
      );
    }
    fixtures.planner.answers.push(modelAnswer(week));
    fixtures.pusher.failures.push(new Error('Expo did not answer'));
    expect(await runWeek(seed)).toMatchObject({ outcome: 'model' });
    expect(fixtures.pusher.sent).toHaveLength(1);
    expect(visible()).toHaveLength(1);
    expect(await episodeOf(seed)).toMatchObject({ state: 'ready' });
  });
});

async function documentaryIn(timeZone: string) {
  const seed = await seedDocumentary();
  await bindings.DB.prepare('UPDATE documentaries SET time_zone = ? WHERE id = ?')
    .bind(timeZone, seed.documentaryId)
    .run();
  return seed;
}

function stubPipeline() {
  const batches: { id: string; params: Record<string, string> }[][] = [];
  const binding = {
    createBatch: (batch: { id: string; params: Record<string, string> }[]) => {
      batches.push(batch);
      return Promise.resolve([]);
    },
  } as unknown as Env['EPISODE_PIPELINE'];
  const started = (ids: string[]) =>
    batches.flat().filter((b) => ids.some((id) => b.id.includes(id)));
  return { binding, batches, started };
}

// Sunday 21 March 2027, 06:00 in Kathmandu (+5:45).
const KATHMANDU_START = '2027-03-21T00:15:00.000Z';
const THIS_WEEK = '2027-03-14';

describe('startDueWeeks', () => {
  it("starts Kathmandu's week at its 06:00 and not Berlin's, and a second call starts nothing", async () => {
    const kathmandu = await documentaryIn('Asia/Kathmandu');
    const berlin = await documentaryIn('Europe/Berlin');
    const stub = stubPipeline();
    const ids = [kathmandu.documentaryId, berlin.documentaryId];
    await startDueWeeks({ DB: bindings.DB, EPISODE_PIPELINE: stub.binding }, KATHMANDU_START);
    expect(stub.started(ids)).toEqual([
      {
        id: `ep-${kathmandu.documentaryId}-${THIS_WEEK}`,
        params: {
          documentaryId: kathmandu.documentaryId,
          weekStart: THIS_WEEK,
          renderAt: '2027-03-21T12:00:00.000Z',
          deliverAt: '2027-03-21T12:15:00.000Z',
        },
      },
    ]);

    // The run's first step records it; the next cron finds it.
    await episodeRuns.start(
      kathmandu.db,
      { documentaryId: kathmandu.documentaryId, weekStart: THIS_WEEK },
      { episodeId: Uuid.parse(crypto.randomUUID()), startedAt: KATHMANDU_START, dueAt: T },
    );
    const again = stubPipeline();
    await startDueWeeks(
      { DB: bindings.DB, EPISODE_PIPELINE: again.binding },
      '2027-03-21T00:30:00.000Z',
    );
    expect(again.started(ids)).toEqual([]);
  });

  it('skips a week whose episode exists and an owner who asked for deletion, through the cron handler', async () => {
    const withEpisode = await documentaryIn('Asia/Kathmandu');
    await episodes.getOrCreate(withEpisode.db, withEpisode.documentaryId, THIS_WEEK, T);
    const leaving = await documentaryIn('Asia/Kathmandu');
    await deletionRequests.request(leaving.db, leaving.userId, T);
    const staying = await documentaryIn('Asia/Kathmandu');
    const stub = stubPipeline();
    const ctx = createExecutionContext();
    worker.scheduled(
      createScheduledController({
        scheduledTime: Date.parse(KATHMANDU_START),
        cron: '*/15 * * * *',
      }),
      { ...bindings, EPISODE_PIPELINE: stub.binding },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(
      stub.started([withEpisode.documentaryId, leaving.documentaryId, staying.documentaryId]),
    ).toEqual([expect.objectContaining({ id: `ep-${staying.documentaryId}-${THIS_WEEK}` })]);
  });
});

describe('migration 0011', () => {
  it('adds episode_runs, one row per documentary and week', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0011_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0011_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    const userId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
    )
      .bind(userId, `${userId}@example.com`)
      .run();
    await applyD1Migrations(MIGRATION_DB, next);
    const kept = await MIGRATION_DB.prepare('SELECT COUNT(*) AS n FROM user WHERE id = ?')
      .bind(userId)
      .first<{ n: number }>();
    expect(kept?.n).toBe(1);
    const insert = (weekStart: string) =>
      MIGRATION_DB.prepare(
        `INSERT INTO episode_runs (documentary_id, week_start, started_at, due_at) VALUES ('d1', ?, ?, ?)`,
      )
        .bind(weekStart, T, T)
        .run();
    await insert('2027-03-14');
    await insert('2027-03-21');
    await expect(insert('2027-03-14')).rejects.toThrow();
  });
});
