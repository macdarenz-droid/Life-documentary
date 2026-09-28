import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { PlannerOutput, type RenderManifestV2, type Uuid } from '@life/contracts';
import { assemblePlan, weekBrief } from '@life/story';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaKey } from '../src/data/mediaKeys';
import { briefInput } from '../src/data/repositories/brief';
import * as costLedger from '../src/data/repositories/costLedger';
import * as episodes from '../src/data/repositories/episodes';
import * as plans from '../src/data/repositories/plans';
import * as renders from '../src/data/repositories/renders';
import { fitStep, lineStep, linesStep, narrateContext } from '../src/pipeline/narrate/steps';
import { KEY_NOT_ALLOWED, mediaUrl } from '../src/pipeline/render/mediaUrl';
import { checkRender, renderContext, renderInput, startRender } from '../src/pipeline/render/steps';
import { RENDERING_NOT_SET_UP, presignGet } from '../src/providers/r2/presign';
import { fixtures } from '../src/providers/fixture';
import { bindings } from './session';
import { WEEK, seedDocumentary, type Seeded } from './understandSeed';

beforeEach(() => fixtures.reset());
afterEach(() => vi.restoreAllMocks());

const T = '2027-03-21T18:00:00.000Z';
const ctx = () => renderContext(bindings);
const HOST = `${bindings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

type Seed = Awaited<ReturnType<typeof seedDocumentary>>;
type Week = Awaited<ReturnType<Seed['fullWeek']>>;

/** A plan over the full week: a video-answer cold open, three bridged scenes and the photo closing. */
function outputFor(week: Week) {
  return PlannerOutput.parse({
    title: 'Rain on the tram',
    coldOpen: { momentId: week.videoAnswer.momentId },
    scenes: [
      {
        heading: 'Wednesday',
        shots: [{ momentId: week.voiceAnswer.momentId }],
        narratorBridge: { text: 'Wednesday, at home.' },
      },
      { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
      {
        heading: 'Home again',
        shots: [{ momentId: week.clip.momentId }, { momentId: week.videoAnswer.momentId }],
        narratorBridge: { text: 'Back home again.' },
      },
    ],
    closing: { momentId: week.photo.momentId },
    musicMood: 'calm',
    lowerThirds: [],
    summary: 'They rode the tram and took a photo.',
  });
}

/** Stores the plan as `version` and points the episode at it. */
async function storePlan(seed: Seed, week: Week, episodeId: Uuid, version: number) {
  const episode = (await episodes.get(seed.db, episodeId))!;
  const brief = weekBrief(await briefInput(seed.db, episode));
  const plan = assemblePlan(outputFor(week), brief, { narratorVoiceId: 'narrator-1' });
  await plans.put(seed.db, { episodeId, version, plan, createdBy: 'model', createdAt: T });
  await episodes.setPlan(
    seed.db,
    episodeId,
    { version, summary: plan.summary, state: 'narrating' },
    T,
  );
}

/** Puts the original of `seeded` into R2 with `contentType`. */
async function putOriginal(seed: Seed, seeded: Seeded, contentType: string) {
  await bindings.MEDIA.put(
    mediaKey(seed.userId, seed.documentaryId, seeded.assetId!, 'original'),
    new Uint8Array(2000).fill(9),
    { httpMetadata: { contentType } },
  );
}

/** A narrated week with a stored plan and, unless told otherwise, every original in R2. */
async function narratedWeek(options: { originals?: boolean; photoType?: string } = {}) {
  const seed = await seedDocumentary();
  const week = await seed.fullWeek();
  const episode = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
  await storePlan(seed, week, episode.id, 1);
  const narrate = narrateContext(bindings);
  const lines = await linesStep(narrate, episode.id);
  for (const index of lines.indices) await lineStep(narrate, episode.id, 1, index);
  await fitStep(narrate, episode.id, 1);
  if (options.originals !== false) {
    await putOriginal(seed, week.videoAnswer, 'video/quicktime');
    await putOriginal(seed, week.voiceAnswer, 'audio/mp4');
    await putOriginal(seed, week.clip, 'video/quicktime');
    await putOriginal(seed, week.photo, options.photoType ?? 'image/jpeg');
  }
  return { seed, week, episode: (await episodes.get(seed.db, episode.id))! };
}

/** Every media and narration source of a manifest. */
function sources(m: RenderManifestV2): string[] {
  const media = m.segments.flatMap((s) => {
    if (s.kind === 'shot' || s.kind === 'coldOpen') return [s.media.src];
    if ((s.kind === 'sceneOpen' || s.kind === 'closing') && s.background) return [s.background.src];
    return [];
  });
  return [...media, ...m.narration.map((n) => n.src)];
}

const overlap = (a: { fromMs: number; toMs: number }, b: { fromMs: number; toMs: number }) =>
  a.fromMs < b.toMs && b.fromMs < a.toMs;

describe('renderInput', () => {
  it('builds a manifest over presigned URLs for the right keys, with the narrator off the person', async () => {
    const { seed, week, episode } = await narratedWeek();
    const manifest = (await renderInput(ctx(), episode, 'portrait'))!;
    expect(manifest).not.toBeNull();
    const prefix = `/${bindings.R2_BUCKET}/u/${seed.userId}/${seed.documentaryId}/`;
    const urls = sources(manifest).map((s) => new URL(s));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.host).toBe(HOST);
      expect(url.pathname.startsWith(prefix)).toBe(true);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    }
    const paths = urls.map((u) => u.pathname);
    for (const seeded of [week.videoAnswer, week.voiceAnswer, week.clip, week.photo]) {
      expect(paths).toContain(`${prefix}${seeded.assetId}/original`);
    }
    expect(paths.some((p) => p.startsWith(`${prefix}narration/${episode.id}/`))).toBe(true);

    const person = manifest.speech.filter((u) => u.kind === 'person');
    const narrator = manifest.speech.filter((u) => u.kind === 'narrator');
    expect(person.length).toBeGreaterThan(0);
    expect(narrator.length).toBeGreaterThan(0);
    for (const p of person) for (const n of narrator) expect(overlap(p, n)).toBe(false);
  });

  it('drops a moment whose original is missing', async () => {
    const { seed, week, episode } = await narratedWeek({ originals: false });
    await putOriginal(seed, week.videoAnswer, 'video/quicktime');
    await putOriginal(seed, week.photo, 'image/jpeg');
    const manifest = (await renderInput(ctx(), episode, 'portrait'))!;
    const paths = sources(manifest).map((s) => new URL(s).pathname);
    expect(paths.some((p) => p.includes(week.voiceAnswer.assetId!))).toBe(false);
    expect(paths.some((p) => p.includes(week.clip.assetId!))).toBe(false);
    expect(manifest.segments.some((s) => s.kind === 'shot' && s.media.type === 'voice')).toBe(
      false,
    );
  });

  it('drops a photo stored as HEIC and makes no URL for it', async () => {
    const { week, episode } = await narratedWeek({ photoType: 'image/heic' });
    const manifest = (await renderInput(ctx(), episode, 'portrait'))!;
    const paths = sources(manifest).map((s) => new URL(s).pathname);
    expect(paths.some((p) => p.includes(week.photo.assetId!))).toBe(false);
    expect(manifest.segments.some((s) => s.kind === 'shot' && s.media.type === 'photo')).toBe(
      false,
    );
  });

  it('leaves out a moment made local-only after planning, with no URL for it', async () => {
    const { week, episode } = await narratedWeek();
    await bindings.DB.prepare('UPDATE moments SET local_only = 1 WHERE id = ?')
      .bind(week.voiceAnswer.momentId)
      .run();
    const manifest = (await renderInput(ctx(), episode, 'portrait'))!;
    const paths = sources(manifest).map((s) => new URL(s).pathname);
    expect(paths.some((p) => p.includes(week.voiceAnswer.assetId!))).toBe(false);
    expect(manifest.segments.some((s) => s.kind === 'shot' && s.media.type === 'voice')).toBe(
      false,
    );
  });

  it('gives nothing to render for an episode with no originals', async () => {
    const { episode } = await narratedWeek({ originals: false });
    expect(await renderInput(ctx(), episode, 'portrait')).toBeNull();
    expect(await startRender(ctx(), episode.id, 'portrait')).toEqual({ outcome: 'nothing' });
    expect(fixtures.renderer.starts).toHaveLength(0);
  });

  it('logs no manifest and no URL', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level),
    );
    const { episode } = await narratedWeek();
    const { id } = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    await checkRender(ctx(), id);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('X-Amz');
    expect(logged).not.toContain(HOST);
    expect(logged).not.toContain('"segments"');
  });
});

describe('portrait renders', () => {
  it('ends done with the MP4 at v1, the episode pointed at it, one ledger row and the cents', async () => {
    const { seed, episode } = await narratedWeek();
    const started = await startRender(ctx(), episode.id, 'portrait');
    expect(started.outcome).toBe('started');
    const id = (started as { id: Uuid }).id;
    expect(fixtures.renderer.starts).toHaveLength(1);
    expect(fixtures.renderer.starts[0]).toMatchObject({
      composition: 'Episode',
      options: { codec: 'h264', privacy: 'no-acl', deleteAfter: '1-day' },
    });
    expect(await checkRender(ctx(), id)).toEqual({ outcome: 'done' });

    const key = `u/${seed.userId}/${seed.documentaryId}/episodes/${episode.id}/v1.mp4`;
    expect(await bindings.MEDIA.head(key)).not.toBeNull();
    const row = (await renders.get(seed.db, id))!;
    expect(row).toMatchObject({
      state: 'done',
      outKey: key,
      costMicroUsd: 12_300,
      renderVersion: 1,
    });
    expect(await episodes.get(seed.db, episode.id)).toMatchObject({
      renderVersion: 1,
      mp4Key: key,
      durationMs: row.durationMs,
      costCents: 2,
    });
    const ledger = await costLedger.forEpisode(seed.db, episode.id);
    expect(ledger.map((r) => [r.step, r.provider, r.unit, r.units, r.microUsd])).toEqual([
      ['render', 'remotionLambda', 'render', 1, 12_300],
    ]);
  });

  it('reports rendering until the renderer is done, and a finished row makes no call', async () => {
    fixtures.renderer.callsUntilDone = 2;
    const { episode } = await narratedWeek();
    const { id } = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    expect(await checkRender(ctx(), id)).toEqual({ outcome: 'rendering' });
    expect(await checkRender(ctx(), id)).toEqual({ outcome: 'done' });
    const progress = vi.spyOn(fixtures.renderer, 'progress');
    expect(await checkRender(ctx(), id)).toEqual({ outcome: 'done' });
    expect(progress).not.toHaveBeenCalled();
  });

  it('starts one render when asked twice for the same plan version', async () => {
    const { episode } = await narratedWeek();
    const first = await startRender(ctx(), episode.id, 'portrait');
    const second = await startRender(ctx(), episode.id, 'portrait');
    expect(second).toEqual(first);
    expect(fixtures.renderer.starts).toHaveLength(1);
  });

  it('renders plan version 2 as v2 and sums both renders in the ledger row', async () => {
    const { seed, week, episode } = await narratedWeek();
    const first = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    await checkRender(ctx(), first.id);
    await storePlan(seed, week, episode.id, 2);
    const second = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    expect(await checkRender(ctx(), second.id)).toEqual({ outcome: 'done' });

    const key = `u/${seed.userId}/${seed.documentaryId}/episodes/${episode.id}/v2.mp4`;
    expect(await bindings.MEDIA.head(key)).not.toBeNull();
    expect(await episodes.get(seed.db, episode.id)).toMatchObject({
      renderVersion: 2,
      mp4Key: key,
    });
    const ledger = await costLedger.forEpisode(seed.db, episode.id);
    expect(ledger.map((r) => [r.step, r.units, r.microUsd])).toEqual([['render', 2, 24_600]]);
  });

  it('leaves the episode unchanged after a failed render, and the next start makes a new one', async () => {
    fixtures.renderer.outcomes.push({ state: 'failed', reason: 'render failed' });
    const { seed, episode } = await narratedWeek();
    const failed = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    expect(await checkRender(ctx(), failed.id)).toEqual({ outcome: 'failed' });
    expect(await renders.get(seed.db, failed.id)).toMatchObject({
      state: 'failed',
      reason: 'render failed',
    });
    const after = (await episodes.get(seed.db, episode.id))!;
    expect(after.renderVersion).toBe(0);
    expect(after.mp4Key).toBeUndefined();
    expect(await costLedger.forEpisode(seed.db, episode.id)).toEqual([]);

    const next = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    expect(next.id).not.toBe(failed.id);
    expect(fixtures.renderer.starts).toHaveLength(2);
    expect(await checkRender(ctx(), next.id)).toEqual({ outcome: 'done' });
  });
});

describe('landscape export', () => {
  it('writes v1-wide.mp4 and leaves the episode at render version 1', async () => {
    const { seed, episode } = await narratedWeek();
    const portrait = (await startRender(ctx(), episode.id, 'portrait')) as { id: Uuid };
    await checkRender(ctx(), portrait.id);
    const wide = (await startRender(ctx(), episode.id, 'landscape')) as { id: Uuid };
    expect(await checkRender(ctx(), wide.id)).toEqual({ outcome: 'done' });

    const base = `u/${seed.userId}/${seed.documentaryId}/episodes/${episode.id}`;
    expect(await bindings.MEDIA.head(`${base}/v1-wide.mp4`)).not.toBeNull();
    expect(fixtures.renderer.starts[1]?.manifest.format).toEqual({ width: 1920, height: 1080 });
    expect(await episodes.get(seed.db, episode.id)).toMatchObject({
      renderVersion: 1,
      mp4Key: `${base}/v1.mp4`,
    });
  });

  it('gives nothing before any portrait render', async () => {
    const { episode } = await narratedWeek();
    expect(await startRender(ctx(), episode.id, 'landscape')).toEqual({ outcome: 'nothing' });
    expect(fixtures.renderer.starts).toHaveLength(0);
  });
});

describe('mediaUrl and presignGet', () => {
  const owner = { userId: crypto.randomUUID() as Uuid, documentaryId: crypto.randomUUID() as Uuid };

  it('signs a key under the owner prefix', async () => {
    const url = new URL(
      await mediaUrl(bindings, owner, `u/${owner.userId}/${owner.documentaryId}/a/original`),
    );
    expect(url.host).toBe(HOST);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('refuses a key of another user or documentary', async () => {
    const other = crypto.randomUUID();
    await expect(
      mediaUrl(bindings, owner, `u/${other}/${owner.documentaryId}/a/original`),
    ).rejects.toThrow(KEY_NOT_ALLOWED);
    await expect(
      mediaUrl(bindings, owner, `u/${owner.userId}/${other}/a/original`),
    ).rejects.toThrow(KEY_NOT_ALLOWED);
    await expect(
      mediaUrl(bindings, owner, `tmp/${owner.userId}/${owner.documentaryId}/a/answer`),
    ).rejects.toThrow(KEY_NOT_ALLOWED);
  });

  it('refuses to sign without credentials', async () => {
    const env = { ...bindings };
    delete env.R2_ACCESS_KEY_ID;
    await expect(presignGet(env, 'u/a/b/c', 900)).rejects.toThrow(RENDERING_NOT_SET_UP);
  });
});

describe('migration 0008', () => {
  it('adds renders, unique by episode, render version and shape, going with its episode', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0008_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0008_'));
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
       VALUES (?, ?, 1, '2027-03-15', '2027-03-21', 'rendering', 1, 0, 0, ?)`,
    )
      .bind(episodeId, documentaryId, T)
      .run();

    await applyD1Migrations(MIGRATION_DB, next);
    const kept = await MIGRATION_DB.prepare('SELECT state FROM episodes WHERE id = ?')
      .bind(episodeId)
      .first<{ state: string }>();
    expect(kept?.state).toBe('rendering');
    const insert = (renderVersion: number, format: string) =>
      MIGRATION_DB.prepare(
        `INSERT INTO renders (id, episode_id, plan_version, render_version, format, out_key, duration_ms, state, started_at)
         VALUES (?, ?, 1, ?, ?, 'k', 30000, 'starting', ?)`,
      )
        .bind(crypto.randomUUID(), episodeId, renderVersion, format, T)
        .run();
    await insert(1, 'portrait');
    await insert(1, 'landscape');
    await insert(2, 'portrait');
    await expect(insert(1, 'portrait')).rejects.toThrow();
    await MIGRATION_DB.prepare('DELETE FROM episodes WHERE id = ?').bind(episodeId).run();
    const left = await MIGRATION_DB.prepare(
      'SELECT COUNT(*) AS n FROM renders WHERE episode_id = ?',
    )
      .bind(episodeId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
