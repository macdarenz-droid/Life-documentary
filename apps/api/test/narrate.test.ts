import { applyD1Migrations, introspectWorkflowInstance } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { PlannerOutput, type Uuid } from '@life/contracts';
import { assemblePlan, weekBrief } from '@life/story';
import { beforeEach, describe, expect, it } from 'vitest';
import { briefInput } from '../src/data/repositories/brief';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import * as narration from '../src/data/repositories/narration';
import * as plans from '../src/data/repositories/plans';
import { episodeInstanceId, startEpisodePipeline } from '../src/pipeline/EpisodePipeline';
import {
  fitStep,
  lineStep,
  linesStep,
  narrateContext,
  recordNarrateCosts,
  type LineResult,
} from '../src/pipeline/narrate/steps';
import { fixtures } from '../src/providers/fixture';
import { bindings } from './session';
import { WEEK, seedDocumentary } from './understandSeed';

beforeEach(() => fixtures.reset());

const T = '2027-03-21T18:00:00.000Z';
const ctx = () => narrateContext(bindings);
const STORYLINE = '00000000-0000-4000-8000-000000000077' as Uuid;
const BRIDGES = ['Wednesday, at home.', 'Then out for a walk.', 'Back home again.'];
const TEASE = 'Next week, the coast.';

type Week = Awaited<ReturnType<Awaited<ReturnType<typeof seedDocumentary>>['fullWeek']>>;

/** A planner answer for the full week, with a bridge on each scene that has one and an optional tease. */
function outputFor(week: Week, bridges: readonly (string | undefined)[], tease?: string) {
  const bridge = (i: number) =>
    bridges[i] !== undefined ? { narratorBridge: { text: bridges[i] } } : {};
  return PlannerOutput.parse({
    title: 'Rain on the tram',
    coldOpen: { momentId: week.videoAnswer.momentId },
    scenes: [
      { heading: 'Wednesday', shots: [{ momentId: week.voiceAnswer.momentId }], ...bridge(0) },
      { heading: 'Out', shots: [{ momentId: week.photo.momentId }], ...bridge(1) },
      {
        heading: 'Home again',
        shots: [{ momentId: week.clip.momentId }, { momentId: week.videoAnswer.momentId }],
        ...bridge(2),
      },
    ],
    closing: { momentId: week.photo.momentId },
    musicMood: 'calm',
    lowerThirds: [],
    summary: 'They rode the tram and took a photo.',
    ...(tease !== undefined ? { tease: { storylineId: STORYLINE, text: tease } } : {}),
  });
}

/** A full week whose episode waits for narration with a stored model plan (version 1). */
async function narratedWeek(bridges: readonly (string | undefined)[] = BRIDGES, tease?: string) {
  const seed = await seedDocumentary();
  const week = await seed.fullWeek();
  const episode = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
  const brief = weekBrief(await briefInput(seed.db, episode));
  const plan = assemblePlan(outputFor(week, bridges, tease), brief, {
    narratorVoiceId: 'narrator-1',
  });
  await plans.put(seed.db, {
    episodeId: episode.id,
    version: 1,
    plan,
    createdBy: 'model',
    createdAt: T,
  });
  await episodes.setPlan(
    seed.db,
    episode.id,
    { version: 1, summary: plan.summary, state: 'narrating' },
    T,
  );
  return { seed, week, episode };
}

/** Runs the narrate steps as the Workflow does, one after the other. */
async function narrate(episodeId: Uuid) {
  const lines = await linesStep(ctx(), episodeId);
  const results: LineResult[] = [];
  for (const index of lines.indices) {
    results.push(await lineStep(ctx(), episodeId, lines.planVersion, index));
  }
  const characters = results.reduce((n, r) => n + ('characters' in r ? r.characters : 0), 0);
  const fit = lines.indices.length > 0 ? await fitStep(ctx(), episodeId, lines.planVersion) : null;
  const cents = await recordNarrateCosts(ctx(), episodeId, characters);
  return { lines, results, characters, fit, cents };
}

const narrateRows = async (episodeId: Uuid) =>
  (await costLedger.forEpisode(ctx().db, episodeId)).filter((r) => r.step === 'narrate');

describe('the narrate steps', () => {
  it('stores a clip with words and a length for three bridges and a tease, and moves on to render', async () => {
    const { seed, episode } = await narratedWeek(BRIDGES, TEASE);
    const { lines, results } = await narrate(episode.id);
    expect(lines).toEqual({ planVersion: 1, indices: [0, 1, 2, 3] });
    expect(results.map((r) => r.outcome)).toEqual(['spoken', 'spoken', 'spoken', 'spoken']);
    expect(fixtures.narrator.calls.map((c) => c.text)).toEqual([...BRIDGES, TEASE]);
    expect(fixtures.narrator.calls[0]).toMatchObject({
      voiceId: 'fixture-voice-1',
      modelId: 'eleven_flash_v2_5',
      outputFormat: 'mp3_44100_128',
      languageCode: 'en',
    });

    const clips = await narration.forEpisode(ctx().db, episode.id, 1);
    expect(clips.map((c) => [c.index, c.kind, c.sceneIndex, c.text, c.kept])).toEqual([
      [0, 'bridge', 0, BRIDGES[0], true],
      [1, 'bridge', 1, BRIDGES[1], true],
      [2, 'bridge', 2, BRIDGES[2], true],
      [3, 'tease', undefined, TEASE, true],
    ]);
    for (const clip of clips) {
      expect(clip.durationMs).toBe(clip.text.length * 60);
      expect(clip.words.map((w) => w.text).join(' ')).toBe(clip.text);
      expect(clip.words[0]).toMatchObject({ fromMs: 0 });
      expect(clip.voiceId).toBe('narrator-1');
      expect(clip.key).toBe(
        `u/${seed.userId}/${seed.documentaryId}/narration/${episode.id}/${clip.hash}.mp3`,
      );
    }
    const stored = await bindings.MEDIA.list({
      prefix: `u/${seed.userId}/${seed.documentaryId}/narration/`,
      include: ['httpMetadata'],
    });
    expect(stored.objects.map((o) => o.key).sort()).toEqual(clips.map((c) => c.key).sort());
    expect(stored.objects.every((o) => o.httpMetadata?.contentType === 'audio/mpeg')).toBe(true);
    expect(await episodes.get(ctx().db, episode.id)).toMatchObject({ state: 'rendering' });
  });

  it('reuses every stored clip when each line is spoken again, with no call', async () => {
    const { episode } = await narratedWeek(BRIDGES, TEASE);
    await narrate(episode.id);
    const before = await narration.forEpisode(ctx().db, episode.id, 1);
    fixtures.narrator.reset();
    for (const index of [0, 1, 2, 3]) {
      expect(await lineStep(ctx(), episode.id, 1, index)).toEqual({ outcome: 'reused' });
    }
    expect(fixtures.narrator.calls).toEqual([]);
    const after = await narration.forEpisode(ctx().db, episode.id, 1);
    expect(after.map((c) => [c.key, c.durationMs, c.words])).toEqual(
      before.map((c) => [c.key, c.durationMs, c.words]),
    );
  });

  it('skips a line with a digit without a call', async () => {
    const { episode } = await narratedWeek([BRIDGES[0], 'At 5 we went out.', BRIDGES[2]]);
    const { results } = await narrate(episode.id);
    expect(results.map((r) => r.outcome)).toEqual(['spoken', 'skipped', 'spoken']);
    expect(fixtures.narrator.calls.map((c) => c.text)).toEqual([BRIDGES[0], BRIDGES[2]]);
    expect((await narration.forEpisode(ctx().db, episode.id, 1)).map((c) => c.index)).toEqual([
      0, 2,
    ]);
  });

  it('leaves out a line whose answer has no alignment, keeps the others and counts its characters', async () => {
    const { episode } = await narratedWeek(BRIDGES);
    const lines = await linesStep(ctx(), episode.id);
    const results: LineResult[] = [];
    for (const index of lines.indices) {
      fixtures.narrator.aligned = index !== 1;
      results.push(await lineStep(ctx(), episode.id, 1, index));
    }
    expect(results).toEqual([
      { outcome: 'spoken', characters: BRIDGES[0]!.length },
      { outcome: 'no-alignment', characters: BRIDGES[1]!.length },
      { outcome: 'spoken', characters: BRIDGES[2]!.length },
    ]);
    await fitStep(ctx(), episode.id, 1);
    const clips = await narration.forEpisode(ctx().db, episode.id, 1);
    expect(clips.map((c) => [c.index, c.kept])).toEqual([
      [0, true],
      [2, true],
    ]);
    const characters = BRIDGES.join('').length;
    await recordNarrateCosts(ctx(), episode.id, characters);
    expect(await narrateRows(episode.id)).toMatchObject([
      {
        provider: 'elevenlabs',
        unit: 'character',
        units: characters,
        microUsd: characters * 50,
      },
    ]);
  });

  it('drops the tease and then the last bridge when the measured narration is over a quarter', async () => {
    const { episode } = await narratedWeek(BRIDGES, TEASE);
    fixtures.narrator.msPerCharacter = 200;
    const { fit } = await narrate(episode.id);
    expect(fit).toEqual({ kept: 2, dropped: 2 });
    const clips = await narration.forEpisode(ctx().db, episode.id, 1);
    expect(clips.map((c) => [c.index, c.kind, c.kept])).toEqual([
      [0, 'bridge', true],
      [1, 'bridge', true],
      [2, 'bridge', false],
      [3, 'tease', false],
    ]);
  });

  it('counts the characters of every answered call in one ledger row, and writes none when nothing was sent', async () => {
    const { episode } = await narratedWeek(BRIDGES, TEASE);
    const { characters, cents } = await narrate(episode.id);
    expect(characters).toBe([...BRIDGES, TEASE].join('').length);
    expect(await narrateRows(episode.id)).toMatchObject([
      { units: characters, microUsd: characters * 50 },
    ]);
    expect((await episodes.get(ctx().db, episode.id))?.costCents).toBe(cents);

    // A second run reuses every clip and sends nothing: the first run's row stays as it was.
    await episodes.setState(ctx().db, episode.id, 'narrating', T);
    const again = await narrate(episode.id);
    expect(again.characters).toBe(0);
    expect(await narrateRows(episode.id)).toMatchObject([{ units: characters }]);

    const quiet = await narratedWeek([BRIDGES[0]]);
    await recordNarrateCosts(ctx(), quiet.episode.id, 0);
    expect(await narrateRows(quiet.episode.id)).toEqual([]);
  });

  it('speaks nothing for an episode that is not waiting for narration', async () => {
    const { episode } = await narratedWeek(BRIDGES);
    await episodes.setState(ctx().db, episode.id, 'rendering', T);
    expect(await linesStep(ctx(), episode.id)).toEqual({ planVersion: 1, indices: [] });
  });
});

/** The week's times, already past: nothing waits for originals or for the hour (T-017e). */
const PAST = { renderAt: '2020-01-05T16:45:00.000Z', deliverAt: '2020-01-05T17:00:00.000Z' };

/** Runs the week's pipeline with sleeps and retry delays off. */
async function runWeek(documentaryId: Uuid) {
  const id = episodeInstanceId(documentaryId, WEEK);
  const instance = await introspectWorkflowInstance(bindings.EPISODE_PIPELINE, id);
  try {
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
    });
    await startEpisodePipeline(bindings, documentaryId, WEEK, PAST);
    await instance.waitForStatus('complete');
    return await instance.getOutput();
  } finally {
    await instance.dispose();
  }
}

const usage = { inputTokens: 10, outputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0 };

async function episodeIdOf(documentaryId: Uuid): Promise<Uuid> {
  const row = await bindings.DB.prepare('SELECT id FROM episodes WHERE documentary_id = ?')
    .bind(documentaryId)
    .first<{ id: Uuid }>();
  return row!.id;
}

describe('EpisodePipeline narration', () => {
  it('narrates a model plan, never sending the week’s transcripts, notes or captions', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push({
      text: JSON.stringify(outputFor(week, BRIDGES)),
      stopReason: 'end_turn',
      usage,
    });
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ plan: 'model' });
    const episodeId = await episodeIdOf(seed.documentaryId);
    expect(await episodes.get(seed.db, episodeId)).toMatchObject({ state: 'ready' });
    expect((await narration.forEpisode(seed.db, episodeId, 1)).map((c) => c.index)).toEqual([
      0, 1, 2,
    ]);

    const weekTexts = [
      'Rain on the tram window.',
      ...(await seed.derivedRows()).flatMap((r) => [r.transcript, r.caption]),
    ].filter((t): t is string => !!t);
    expect(weekTexts.length).toBeGreaterThanOrEqual(3);
    const sent = JSON.stringify(fixtures.narrator.calls);
    for (const text of weekTexts) expect(sent).not.toContain(text);
    const characters = BRIDGES.join('').length;
    expect(await narrateRows(episodeId)).toMatchObject([{ units: characters }]);
    expect(output).toMatchObject({
      costCents: (await episodes.get(seed.db, episodeId))?.costCents,
    });
  });

  it('leaves out a line whose every attempt fails and completes', async () => {
    const seed = await seedDocumentary();
    const week = await seed.fullWeek();
    fixtures.planner.answers.push({
      text: JSON.stringify(outputFor(week, BRIDGES)),
      stopReason: 'end_turn',
      usage,
    });
    // The first line's six attempts (one and five retries) all fail; the next two lines are spoken.
    fixtures.narrator.failures.push(...Array.from({ length: 6 }, () => new Error('Too many')));
    await runWeek(seed.documentaryId);
    const episodeId = await episodeIdOf(seed.documentaryId);
    expect(fixtures.narrator.calls).toHaveLength(8);
    expect((await narration.forEpisode(seed.db, episodeId, 1)).map((c) => c.index)).toEqual([1, 2]);
    expect(await episodes.get(seed.db, episodeId)).toMatchObject({ state: 'ready' });
    expect(await narrateRows(episodeId)).toMatchObject([
      { units: BRIDGES[1]!.length + BRIDGES[2]!.length },
    ]);
  });

  it('has no narrate steps for a recap plan', async () => {
    const seed = await seedDocumentary();
    await seed.fullWeek();
    fixtures.planner.answers.push(new Error('Overloaded'), new Error('Overloaded'));
    const output = await runWeek(seed.documentaryId);
    expect(output).toMatchObject({ plan: 'recap' });
    const episodeId = await episodeIdOf(seed.documentaryId);
    expect(fixtures.narrator.calls).toEqual([]);
    expect(await narration.forEpisode(seed.db, episodeId, 1)).toEqual([]);
    expect(await narrateRows(episodeId)).toEqual([]);
    expect(await episodes.get(seed.db, episodeId)).toMatchObject({ state: 'ready' });
  });
});

describe('migration 0007', () => {
  it('adds narration_clips, unique by episode, plan version and index, going with its episode', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0007_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0007_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    const userId = crypto.randomUUID();
    const documentaryId = crypto.randomUUID();
    const episodeId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
    )
      .bind(userId, `${userId}@example.com`)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES (?, ?, 'Kept', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
    )
      .bind(documentaryId, userId, T, T)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO episodes (id, documentary_id, number, week_start, week_end, state, plan_version, render_version, cost_cents, updated_at)
       VALUES (?, ?, 1, '2027-03-15', '2027-03-21', 'narrating', 1, 0, 0, ?)`,
    )
      .bind(episodeId, documentaryId, T)
      .run();

    await applyD1Migrations(MIGRATION_DB, next);
    const kept = await MIGRATION_DB.prepare('SELECT state FROM episodes WHERE id = ?')
      .bind(episodeId)
      .first<{ state: string }>();
    expect(kept?.state).toBe('narrating');
    const insertClip = (planVersion: number, index: number) =>
      MIGRATION_DB.prepare(
        `INSERT INTO narration_clips (episode_id, plan_version, "index", kind, scene_index, text, voice_id, key, hash, duration_ms, words, kept, created_at)
         VALUES (?, ?, ?, 'bridge', 0, 'Wednesday, at home.', 'narrator-1', 'k', ?, 1140, '[]', 1, ?)`,
      )
        .bind(episodeId, planVersion, index, 'a'.repeat(64), T)
        .run();
    await insertClip(1, 0);
    await insertClip(1, 1);
    await insertClip(2, 0);
    await expect(insertClip(1, 0)).rejects.toThrow();
    await MIGRATION_DB.prepare('DELETE FROM episodes WHERE id = ?').bind(episodeId).run();
    const left = await MIGRATION_DB.prepare(
      'SELECT COUNT(*) AS n FROM narration_clips WHERE episode_id = ?',
    )
      .bind(episodeId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
