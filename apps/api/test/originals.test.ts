import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import {
  Documentary,
  Me,
  PlannerOutput,
  SyncChange,
  SyncResponse,
  Uuid,
  UploadedPart,
} from '@life/contracts';
import { assemblePlan, weekBrief } from '@life/story';
import { beforeEach, describe, expect, it } from 'vitest';
import { database } from '../src/data/db';
import { mediaKey } from '../src/data/mediaKeys';
import { briefInput } from '../src/data/repositories/brief';
import * as devicesRepo from '../src/data/repositories/devices';
import * as episodes from '../src/data/repositories/episodes';
import * as originalRequests from '../src/data/repositories/originalRequests';
import * as plans from '../src/data/repositories/plans';
import { deliverContext } from '../src/pipeline/deliver/context';
import { keepAnswers } from '../src/pipeline/deliver/keepAnswers';
import { requestOriginals } from '../src/pipeline/deliver/requestOriginals';
import { uploadsAllowed } from '../src/policy/leavesDevice';
import { fixtures } from '../src/providers/fixture';
import { ORIGINALS_READY } from '../src/routes/uploads';
import type { Env } from '../src/shared/env';
import { bindings, testApp } from './session';
import { WEEK, seedDocumentary, type Seeded } from './understandSeed';

const T = '2027-03-21T18:00:00.000Z';
const T0 = '2027-03-15T08:00:00.000Z';
const ctx = () => deliverContext(bindings);

type Seed = Awaited<ReturnType<typeof seedDocumentary>>;

beforeEach(() => fixtures.reset());

/** A plan showing both answers, the photo and the clip; stored as version 1. */
async function plannedWeek() {
  const seed = await seedDocumentary();
  const week = await seed.fullWeek();
  const episode = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
  const output = PlannerOutput.parse({
    title: 'Rain on the tram',
    coldOpen: { momentId: week.videoAnswer.momentId },
    scenes: [
      { heading: 'Wednesday', shots: [{ momentId: week.voiceAnswer.momentId }] },
      { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
      { heading: 'Home', shots: [{ momentId: week.clip.momentId }] },
    ],
    closing: { momentId: week.photo.momentId },
    musicMood: 'calm',
    lowerThirds: [],
    summary: 'They rode the tram and took a photo.',
  });
  const brief = weekBrief(await briefInput(seed.db, episode));
  const plan = assemblePlan(output, brief, { narratorVoiceId: 'narrator-1' });
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
  return { seed, week, episode: (await episodes.get(seed.db, episode.id))! };
}

const originalOf = (seed: Seed, seeded: Seeded) =>
  mediaKey(seed.userId, seed.documentaryId, seeded.assetId!, 'original');

async function bytesOf(key: string) {
  const object = await bindings.MEDIA.get(key);
  if (!object) return null;
  return {
    bytes: new Uint8Array(await object.arrayBuffer()),
    contentType: object.httpMetadata?.contentType,
  };
}

async function setMoment(momentId: string, column: 'local_only' | 'deleted_at', value: unknown) {
  await bindings.DB.prepare(`UPDATE moments SET ${column} = ? WHERE id = ?`)
    .bind(value, momentId)
    .run();
}

describe('keepAnswers', () => {
  it('copies the chosen answers to their originals with the same bytes and type', async () => {
    const { seed, week, episode } = await plannedWeek();
    const unchosen = await seed.add('voiceAnswer');
    await seed.upload(unchosen, 'answer');

    const kept = await keepAnswers(ctx(), episode);
    expect(kept.sort()).toEqual([week.videoAnswer.momentId, week.voiceAnswer.momentId].sort());
    for (const answer of [week.videoAnswer, week.voiceAnswer]) {
      const working = await bytesOf(
        mediaKey(seed.userId, seed.documentaryId, answer.assetId!, 'answer'),
      );
      expect(await bytesOf(originalOf(seed, answer))).toEqual(working);
    }
    expect((await bytesOf(originalOf(seed, week.videoAnswer)))?.contentType).toBe(
      'video/quicktime',
    );
    expect(await bytesOf(originalOf(seed, unchosen))).toBeNull();

    // A second run changes nothing.
    expect(await keepAnswers(ctx(), episode)).toEqual([]);
  });

  it('keeps no answer made local-only or deleted after planning', async () => {
    const { seed, week, episode } = await plannedWeek();
    await setMoment(week.voiceAnswer.momentId, 'local_only', 1);
    await setMoment(week.videoAnswer.momentId, 'deleted_at', T);
    expect(await keepAnswers(ctx(), episode)).toEqual([]);
    expect(await bytesOf(originalOf(seed, week.voiceAnswer))).toBeNull();
    expect(await bytesOf(originalOf(seed, week.videoAnswer))).toBeNull();
  });
});

describe('requestOriginals', () => {
  it("opens requests for the plan's photo and clip without originals, and sends one silent push", async () => {
    const { seed, week, episode } = await plannedWeek();
    await devicesRepo.upsert(
      seed.db,
      seed.userId,
      {
        id: Uuid.parse(crypto.randomUUID()),
        platform: 'ios',
        appVersion: '1.0.0',
        pushToken: 'ExponentPushToken[orig]',
      },
      T,
    );
    expect(await requestOriginals(ctx(), episode)).toBe(2);
    const rows = await originalRequests.forEpisode(seed.db, episode.id);
    expect(rows.map((r) => r.assetId).sort()).toEqual(
      [week.photo.assetId, week.clip.assetId].sort(),
    );
    expect(rows.every((r) => r.state === 'open')).toBe(true);
    expect(fixtures.pusher.sent).toEqual([
      { to: 'ExponentPushToken[orig]', data: { type: 'originals' }, silent: true },
    ]);
  });

  it('opens none for answers or for a clip whose original is there, and none for a local-only photo', async () => {
    const { seed, week, episode } = await plannedWeek();
    await bindings.MEDIA.put(originalOf(seed, week.clip), new Uint8Array(10));
    await setMoment(week.photo.momentId, 'local_only', 1);
    expect(await requestOriginals(ctx(), episode)).toBe(0);
    expect(await originalRequests.forEpisode(seed.db, episode.id)).toEqual([]);
    expect(fixtures.pusher.sent).toEqual([]);
  });

  it('keeps a met request met when asked again', async () => {
    const { seed, week, episode } = await plannedWeek();
    await requestOriginals(ctx(), episode);
    await originalRequests.meet(seed.db, week.photo.assetId!, T);
    expect(await requestOriginals(ctx(), episode)).toBe(1);
    const states = Object.fromEntries(
      (await originalRequests.forEpisode(seed.db, episode.id)).map((r) => [r.assetId, r.state]),
    );
    expect(states).toEqual({ [week.photo.assetId!]: 'met', [week.clip.assetId!]: 'open' });
  });
});

describe('leavesDevice on the server', () => {
  const photo = {
    id: Uuid.parse(crypto.randomUUID()),
    documentaryId: Uuid.parse(crypto.randomUUID()),
    authorUserId: Uuid.parse(crypto.randomUUID()),
    capturedAt: T0,
    timeZone: 'Europe/Berlin',
    kind: 'photo' as const,
    mediaAssetId: Uuid.parse(crypto.randomUUID()),
    localOnly: false,
    storylineIds: [],
    castIds: [],
    updatedAt: T0,
  };
  it('allows the original of a requested photo, never of a local-only one', () => {
    expect(uploadsAllowed(photo, 'photo', { requested: true })).toEqual(['preview', 'original']);
    expect(uploadsAllowed(photo, 'photo', { requested: false })).toEqual(['preview']);
    expect(uploadsAllowed({ ...photo, localOnly: true }, 'photo', { requested: true })).toEqual([]);
  });
});

/** A signed-in person with a synced photo moment in WEEK and its episode. */
async function personWithPhoto(
  email: string,
  overrides: Partial<Env> = {},
  kind: 'photo' | 'answer' = 'photo',
) {
  const phone = testApp(overrides);
  const cookie = await phone.signIn(email);
  const me = Me.parse(await (await phone.call('/me', { cookie })).json());
  const documentary = Documentary.parse({
    id: crypto.randomUUID(),
    ownerUserId: me.userId,
    title: 'My documentary',
    kind: 'solo',
    timeZone: 'Europe/Berlin',
    episodeDay: 0,
    episodeHour: 18,
    createdAt: T0,
    updatedAt: T0,
  });
  expect((await phone.post('/documentaries/link', documentary, cookie)).status).toBe(200);
  const assetId = Uuid.parse(crypto.randomUUID());
  const momentId = Uuid.parse(crypto.randomUUID());
  const asset = SyncChange.parse({
    entity: 'mediaAsset',
    row: {
      id: assetId,
      ownerUserId: me.userId,
      kind: kind === 'photo' ? 'photo' : 'audio',
      ...(kind === 'photo' ? { width: 1080, height: 1920 } : { durationMs: 9000 }),
      bytes: 1000,
      sha256: 'a'.repeat(64),
      createdAt: T0,
    },
  });
  const moment = {
    id: momentId,
    documentaryId: documentary.id,
    authorUserId: me.userId,
    capturedAt: T0,
    timeZone: 'Europe/Berlin',
    kind,
    ...(kind === 'answer' ? { questionId: Uuid.parse(crypto.randomUUID()) } : {}),
    mediaAssetId: assetId,
    localOnly: false,
    storylineIds: [],
    castIds: [],
    updatedAt: T0,
  };
  const synced = await phone.post(
    '/sync',
    {
      documentaryId: documentary.id,
      cursor: null,
      changes: [asset, { entity: 'moment', row: moment }],
    },
    cookie,
  );
  expect(synced.status).toBe(200);
  const db = database(bindings.DB);
  const episode = await episodes.getOrCreate(db, documentary.id, WEEK, T);
  const createOriginal = () =>
    phone.post(
      '/uploads',
      { assetId, purpose: 'original', contentType: 'image/jpeg', bytes: 1000 },
      cookie,
    );
  const pull = async (cursor: number | null = null) =>
    SyncResponse.parse(
      await (
        await phone.post('/sync', { documentaryId: documentary.id, cursor, changes: [] }, cookie)
      ).json(),
    );
  return { phone, cookie, me, db, documentary, assetId, moment, episode, createOriginal, pull };
}

function stubPipeline() {
  const events: { id: string; type: string; payload: unknown }[] = [];
  const binding = {
    get: (id: string) =>
      Promise.resolve({
        sendEvent: ({ type, payload }: { type: string; payload: unknown }) => {
          events.push({ id, type, payload });
          return Promise.resolve();
        },
      }),
  } as unknown as Env['EPISODE_PIPELINE'];
  return { binding, events };
}

describe('original uploads', () => {
  it('refuses an original for an unrequested asset without Cloud backup', async () => {
    const p = await personWithPhoto('orig.refused@example.com');
    expect((await p.createOriginal()).status).toBe(403);
  });

  it('accepts a requested original and, when the last one arrives, wakes the run', async () => {
    const pipeline = stubPipeline();
    const p = await personWithPhoto('orig.ready@example.com', {
      EPISODE_PIPELINE: pipeline.binding,
    });
    await originalRequests.open(
      p.db,
      p.episode.id,
      [{ documentaryId: p.documentary.id, momentId: p.moment.id, assetId: p.assetId }],
      T,
    );
    expect((await p.createOriginal()).status).toBe(200);
    const put = await p.phone.call(`/uploads/${p.assetId}/original/parts/1`, {
      method: 'PUT',
      body: new Uint8Array(1000).fill(3),
      headers: { 'content-length': '1000' },
      cookie: p.cookie,
    });
    expect(put.status).toBe(200);
    const done = await p.phone.post(
      `/uploads/${p.assetId}/original/complete`,
      { parts: [UploadedPart.parse(await put.json())] },
      p.cookie,
    );
    expect(done.status).toBe(200);
    expect(pipeline.events).toEqual([
      {
        id: `ep-${p.documentary.id}-${WEEK}`,
        type: ORIGINALS_READY,
        payload: { episodeId: p.episode.id },
      },
    ]);
    const [request] = await originalRequests.forEpisode(p.db, p.episode.id);
    expect(request?.state).toBe('met');
  });
});

describe('requests in sync', () => {
  it('pulls the requests, and pulls them closed after closeAll, which aborts an open upload', async () => {
    const p = await personWithPhoto('orig.pull@example.com');
    await originalRequests.open(
      p.db,
      p.episode.id,
      [{ documentaryId: p.documentary.id, momentId: p.moment.id, assetId: p.assetId }],
      T,
    );
    const first = await p.pull();
    const pulled = first.changes.filter((c) => c.entity === 'originalRequest');
    expect(pulled.map((c) => c.row.state)).toEqual(['open']);
    expect(pulled[0]?.row).toMatchObject({ episodeId: p.episode.id, assetId: p.assetId });

    expect((await p.createOriginal()).status).toBe(200);
    const closed = await originalRequests.closeAll(p.db, bindings.MEDIA, p.episode.id, T);
    expect(closed.map((r) => r.state)).toEqual(['closed']);
    const upload = await bindings.DB.prepare(
      "SELECT COUNT(*) AS n FROM uploads WHERE asset_id = ? AND purpose = 'original'",
    )
      .bind(p.assetId)
      .first<{ n: number }>();
    expect(upload?.n).toBe(0);
    const next = await p.pull(first.cursor);
    expect(
      next.changes.filter((c) => c.entity === 'originalRequest').map((c) => c.row.state),
    ).toEqual(['closed']);
    // Closed, the original is refused again.
    expect((await p.createOriginal()).status).toBe(403);
  });
});

describe('deleting a moment', () => {
  const tombstone = (p: Awaited<ReturnType<typeof personWithPhoto>>) =>
    p.phone.post(
      '/sync',
      {
        documentaryId: p.documentary.id,
        cursor: null,
        changes: [{ entity: 'moment', row: { ...p.moment, updatedAt: T, deletedAt: T } }],
      },
      p.cookie,
    );

  it('removes the original of an answer that was kept', async () => {
    const p = await personWithPhoto('orig.delete.answer@example.com', {}, 'answer');
    // The copy keepAnswers makes of a chosen answer.
    const key = mediaKey(p.me.userId, p.documentary.id, p.assetId, 'original');
    await bindings.MEDIA.put(key, new Uint8Array(10), {
      httpMetadata: { contentType: 'audio/mp4' },
    });
    expect(SyncResponse.parse(await (await tombstone(p)).json()).refused).toEqual([]);
    expect(await bindings.MEDIA.head(key)).toBeNull();
  });

  it('leaves the tombstone uncommitted when the R2 delete fails, and the retry deletes and commits', async () => {
    let failNext = true;
    const flaky = new Proxy(bindings.MEDIA, {
      get(target, prop) {
        if (prop === 'delete' && failNext) {
          failNext = false;
          return () => Promise.reject(new Error('R2 is unavailable'));
        }
        const value: unknown = Reflect.get(target, prop);
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    });
    const p = await personWithPhoto('orig.delete.retry@example.com', { MEDIA: flaky }, 'answer');
    const key = mediaKey(p.me.userId, p.documentary.id, p.assetId, 'original');
    await bindings.MEDIA.put(key, new Uint8Array(10));
    const deletedAt = () =>
      bindings.DB.prepare('SELECT deleted_at AS d FROM moments WHERE id = ?')
        .bind(p.moment.id)
        .first<{ d: string | null }>();

    expect((await tombstone(p)).status).toBe(500);
    expect((await deletedAt())?.d).toBeNull();
    expect(await bindings.MEDIA.head(key)).not.toBeNull();

    expect(SyncResponse.parse(await (await tombstone(p)).json()).refused).toEqual([]);
    expect((await deletedAt())?.d).toBe(T);
    expect(await bindings.MEDIA.head(key)).toBeNull();
  });

  it('deletes a stray original when a tombstone comes again for a deleted moment', async () => {
    const p = await personWithPhoto('orig.delete.again@example.com', {}, 'answer');
    expect(SyncResponse.parse(await (await tombstone(p)).json()).refused).toEqual([]);
    const key = mediaKey(p.me.userId, p.documentary.id, p.assetId, 'original');
    await bindings.MEDIA.put(key, new Uint8Array(10));

    const again = SyncResponse.parse(await (await tombstone(p)).json());
    expect(again.refused).toEqual([{ entity: 'moment', id: p.moment.id, reason: 'stale' }]);
    expect(await bindings.MEDIA.head(key)).toBeNull();
  });

  it("closes the moment's open requests", async () => {
    const p = await personWithPhoto('orig.delete.photo@example.com');
    await originalRequests.open(
      p.db,
      p.episode.id,
      [{ documentaryId: p.documentary.id, momentId: p.moment.id, assetId: p.assetId }],
      T,
    );
    expect(SyncResponse.parse(await (await tombstone(p)).json()).refused).toEqual([]);
    const [request] = await originalRequests.forEpisode(p.db, p.episode.id);
    expect(request?.state).toBe('closed');
  });
});

describe('migration 0010', () => {
  it('adds original_requests, unique by episode and asset, going with its episode', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0010_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0010_'));
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
    const insert = (assetId: string) =>
      MIGRATION_DB.prepare(
        `INSERT INTO original_requests (id, episode_id, documentary_id, moment_id, asset_id, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      )
        .bind(crypto.randomUUID(), episodeId, documentaryId, crypto.randomUUID(), assetId, T, T)
        .run();
    const asset = crypto.randomUUID();
    await insert(asset);
    await insert(crypto.randomUUID());
    await expect(insert(asset)).rejects.toThrow();
    await MIGRATION_DB.prepare('DELETE FROM episodes WHERE id = ?').bind(episodeId).run();
    const left = await MIGRATION_DB.prepare(
      'SELECT COUNT(*) AS n FROM original_requests WHERE episode_id = ?',
    )
      .bind(episodeId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
