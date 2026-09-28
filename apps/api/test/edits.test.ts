import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { EditResult, EpisodeCut, Me, PlannerOutput, Uuid, type EditChange } from '@life/contracts';
import { assemblePlan, weekBrief } from '@life/story';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { database } from '../src/data/db';
import { mediaKey } from '../src/data/mediaKeys';
import { briefInput } from '../src/data/repositories/brief';
import * as episodes from '../src/data/repositories/episodes';
import * as originalRequests from '../src/data/repositories/originalRequests';
import * as plans from '../src/data/repositories/plans';
import { checkRender, renderContext, startRender } from '../src/pipeline/render/steps';
import { uploadsAllowed } from '../src/policy/leavesDevice';
import type { Env } from '../src/shared/env';
import { bindings, testApp } from './session';
import { WEEK, seedDocumentary, type Seeded } from './understandSeed';

const T = '2027-03-21T18:00:00.000Z';
const CONTENT_TYPE = {
  videoAnswer: 'video/quicktime',
  voiceAnswer: 'audio/mp4',
  photo: 'image/jpeg',
  clip: 'video/mp4',
  note: 'text/plain',
} as const;

const db = () => database(bindings.DB);

afterEach(() => {
  vi.useRealTimers();
});

/** A stub re-cut binding that records what the route asks of it; either call can be made to throw. */
function stubRecuts({ createThrows = false, sendThrows = false } = {}) {
  const created: { id: string; params: unknown }[] = [];
  const events: { id: string; type: string }[] = [];
  const binding = {
    createBatch: (batch: { id: string; params: unknown }[]) => {
      if (createThrows) return Promise.reject(new Error('Workflows is down.'));
      created.push(...batch);
      return Promise.resolve([]);
    },
    get: (id: string) =>
      Promise.resolve({
        sendEvent: ({ type }: { type: string }) => {
          if (sendThrows) return Promise.reject(new Error('The instance is not running.'));
          events.push({ id, type });
          return Promise.resolve();
        },
      }),
  } as unknown as Env['RECUT_PIPELINE'];
  return { binding, created, events };
}

/**
 * A signed-in person's published episode: both answers, the photo and the clip, a narrator line on the
 * first scene, rendered once. A third answer (`spare`) is in the week but not in the cut.
 */
async function publishedEpisode(email: string, stub = stubRecuts()) {
  const seed = await seedDocumentary();
  const week = await seed.fullWeek();
  const spare = await seed.add('voiceAnswer');
  const phone = testApp({ RECUT_PIPELINE: stub.binding });
  const cookie = await phone.signIn(email);
  const me = Me.parse(await (await phone.call('/me', { cookie })).json());
  for (const statement of [
    'UPDATE documentaries SET owner_user_id = ? WHERE id = ?',
    'UPDATE media_assets SET owner_user_id = ? WHERE documentary_id = ?',
    'UPDATE moments SET author_user_id = ? WHERE documentary_id = ?',
  ]) {
    await bindings.DB.prepare(statement).bind(me.userId, seed.documentaryId).run();
  }
  const originalKey = (seeded: Seeded) =>
    mediaKey(me.userId, seed.documentaryId, seeded.assetId!, 'original');
  const putOriginal = (seeded: Seeded) =>
    bindings.MEDIA.put(originalKey(seeded), new Uint8Array(100).fill(1), {
      httpMetadata: { contentType: CONTENT_TYPE[seeded.kind] },
    });

  const found = await episodes.getOrCreate(seed.db, seed.documentaryId, WEEK, T);
  const brief = weekBrief(await briefInput(seed.db, found));
  const plan = assemblePlan(
    PlannerOutput.parse({
      title: 'Rain on the tram',
      coldOpen: { momentId: week.videoAnswer.momentId },
      scenes: [
        {
          heading: 'Wednesday',
          shots: [{ momentId: week.voiceAnswer.momentId }],
          narratorBridge: { text: 'Wednesday, at home.' },
        },
        { heading: 'Out', shots: [{ momentId: week.photo.momentId }] },
        { heading: 'Home', shots: [{ momentId: week.clip.momentId }] },
      ],
      closing: { momentId: week.photo.momentId },
      musicMood: 'calm',
      lowerThirds: [],
      summary: 'They rode the tram and took a photo.',
    }),
    brief,
    { narratorVoiceId: 'narrator-1' },
  );
  await plans.put(seed.db, {
    episodeId: found.id,
    version: 1,
    plan,
    createdBy: 'model',
    createdAt: T,
  });
  await episodes.setPlan(
    seed.db,
    found.id,
    { version: 1, summary: plan.summary, state: 'rendering' },
    T,
  );
  for (const seeded of [week.videoAnswer, week.voiceAnswer, week.photo, week.clip]) {
    await putOriginal(seeded);
  }
  const render = renderContext(bindings);
  const started = await startRender(render, found.id, 'portrait');
  if (started.outcome !== 'started') throw new Error('The render did not start.');
  await checkRender(render, started.id);
  await episodes.setDelivered(seed.db, found.id, T);
  const episodeId = found.id;

  const send = async (
    change: EditChange,
    appliedToVersion = 1,
    id: string = crypto.randomUUID(),
  ) => {
    const res = await phone.post(
      `/episodes/${episodeId}/edits`,
      { id, appliedToVersion, change },
      cookie,
    );
    expect(res.status).toBe(200);
    return EditResult.parse(await res.json());
  };
  const cut = async () => {
    const res = await phone.call(`/episodes/${episodeId}/cut`, { cookie });
    expect(res.status).toBe(200);
    return EpisodeCut.parse(await res.json());
  };
  const requestOf = async (seeded: Seeded) =>
    (await originalRequests.forEpisode(db(), episodeId)).find((r) => r.assetId === seeded.assetId);
  return {
    seed,
    week,
    spare,
    phone,
    cookie,
    me,
    episodeId,
    send,
    cut,
    putOriginal,
    originalKey,
    requestOf,
    stub,
  };
}

const count = async (table: 'episode_plans' | 'episode_edits', episodeId: string) =>
  (
    await bindings.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE episode_id = ?`)
      .bind(episodeId)
      .first<{ n: number }>()
  )?.n;

const retitle = (title: string): EditChange => ({ kind: 'retitle', title });

describe('POST /episodes/:id/edits', () => {
  it('stores version 2 as an edit and starts one run', async () => {
    const p = await publishedEpisode('edits.first@example.com');
    const result = await p.send(retitle('The tram'));
    expect(result).toMatchObject({
      outcome: 'applied',
      waitingFor: [],
      cut: { planVersion: 2, title: 'The tram', editsLeft: 9, editsPerDay: 10, recut: 'working' },
    });
    expect(await plans.current(db(), p.episodeId)).toMatchObject({ version: 2, createdBy: 'edit' });
    expect(p.stub.created).toEqual([
      {
        id: `recut-${p.episodeId}-v2`,
        params: { episodeId: p.episodeId, runId: `recut-${p.episodeId}-v2` },
      },
    ]);
    expect(p.stub.events).toEqual([]);
  });

  it('wakes the running run for a second change and starts nothing', async () => {
    const p = await publishedEpisode('edits.second@example.com');
    await p.send(retitle('The tram'));
    expect((await p.cut()).planVersion).toBe(2);
    const second = await p.send({ kind: 'musicMood', mood: 'warm' }, 2);
    expect(second).toMatchObject({ outcome: 'applied', cut: { planVersion: 3, mood: 'warm' } });
    expect(p.stub.created).toHaveLength(1);
    expect(p.stub.events).toEqual([{ id: `recut-${p.episodeId}-v2`, type: 'originals-ready' }]);
  });

  it('is applied and stored once when sendEvent or createBatch throws', async () => {
    const sendFails = await publishedEpisode(
      'edits.send.fails@example.com',
      stubRecuts({ sendThrows: true }),
    );
    await sendFails.send(retitle('The tram'));
    expect(await sendFails.send(retitle('The tram again'), 2)).toMatchObject({
      outcome: 'applied',
    });
    expect(await count('episode_plans', sendFails.episodeId)).toBe(3);

    const createFails = await publishedEpisode(
      'edits.create.fails@example.com',
      stubRecuts({ createThrows: true }),
    );
    expect(await createFails.send(retitle('The tram'))).toMatchObject({ outcome: 'applied' });
    expect(await count('episode_plans', createFails.episodeId)).toBe(2);
    expect(await count('episode_edits', createFails.episodeId)).toBe(1);
    // The claim stays set for the cron to recover.
    expect((await episodes.recutOf(db(), createFails.episodeId))?.run).toBe(
      `recut-${createFails.episodeId}-v2`,
    );
  });

  it('answers stale with the current cut for a change on an older version', async () => {
    const p = await publishedEpisode('edits.stale@example.com');
    await p.send(retitle('The tram'));
    expect(await p.send(retitle('Another title'))).toMatchObject({
      outcome: 'stale',
      cut: { planVersion: 2, title: 'The tram' },
    });
    expect(await count('episode_plans', p.episodeId)).toBe(2);
  });

  it('applies one of two changes sent together on the same version, and the other is stale', async () => {
    const p = await publishedEpisode('edits.race@example.com');
    const results = await Promise.all([p.send(retitle('First')), p.send(retitle('Second'))]);
    const applied = results.filter((r) => r.outcome === 'applied');
    expect(applied).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'stale')).toHaveLength(1);
    const title = applied[0]?.outcome === 'applied' ? applied[0].cut.title : undefined;
    expect((await plans.current(db(), p.episodeId))?.plan.title).toBe(title);
    expect(await count('episode_plans', p.episodeId)).toBe(2);
    expect(await count('episode_edits', p.episodeId)).toBe(1);
  });

  it('stores nothing for a refused change and does not count it', async () => {
    const p = await publishedEpisode('edits.refused@example.com');
    expect(await p.send({ kind: 'closingShot', momentId: p.spare.momentId })).toEqual({
      outcome: 'refused',
      reason: 'notInCut',
    });
    expect(await count('episode_plans', p.episodeId)).toBe(1);
    expect(await p.cut()).toMatchObject({ planVersion: 1, editsLeft: 10 });
    expect(p.stub.created).toEqual([]);
  });

  it('gives limit on the 11th change of the local day and allows the next day', async () => {
    const p = await publishedEpisode('edits.limit@example.com');
    // Kolkata has no summer time: 18:00 UTC is 23:30 there, 19:00 UTC is 00:30 the next local day.
    // Today, so the session is still valid.
    await bindings.DB.prepare("UPDATE documentaries SET time_zone = 'Asia/Kolkata' WHERE id = ?")
      .bind(p.seed.documentaryId)
      .run();
    const today = new Date().toISOString().slice(0, 10);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T18:00:00.000Z`));
    for (let n = 1; n <= 10; n += 1) {
      expect(await p.send(retitle(`Take ${n}`), n)).toMatchObject({ outcome: 'applied' });
    }
    expect(await p.send(retitle('Take 11'), 11)).toMatchObject({
      outcome: 'limit',
      cut: { planVersion: 11, editsLeft: 0 },
    });
    vi.setSystemTime(new Date(`${today}T19:00:00.000Z`));
    expect(await p.send(retitle('Take 11'), 11)).toMatchObject({
      outcome: 'applied',
      cut: { planVersion: 12, editsLeft: 9 },
    });
  });

  it('stores one row and one version when the same edit id comes twice', async () => {
    const p = await publishedEpisode('edits.replay@example.com');
    const id = crypto.randomUUID();
    await p.send(retitle('The tram'), 1, id);
    expect(await p.send(retitle('The tram'), 1, id)).toMatchObject({
      outcome: 'applied',
      waitingFor: [],
      cut: { planVersion: 2 },
    });
    expect(await count('episode_edits', p.episodeId)).toBe(1);
    expect(await count('episode_plans', p.episodeId)).toBe(2);
    expect(p.stub.created).toHaveLength(1);
  });
});

describe('swapped-in answers', () => {
  const swapIn = (momentId: string): EditChange => ({
    kind: 'swapLine',
    sceneIndex: 0,
    with: { kind: 'moment', momentId: Uuid.parse(momentId) },
  });

  it('opens a request for an answer without an original, and waits for none when it has one', async () => {
    const p = await publishedEpisode('edits.answer.missing@example.com');
    expect(await p.send(swapIn(p.spare.momentId))).toMatchObject({
      outcome: 'applied',
      waitingFor: [p.spare.momentId],
    });
    expect((await p.requestOf(p.spare))?.state).toBe('open');

    const q = await publishedEpisode('edits.answer.there@example.com');
    await q.putOriginal(q.spare);
    expect(await q.send(swapIn(q.spare.momentId))).toMatchObject({
      outcome: 'applied',
      waitingFor: [],
    });
    expect(await q.requestOf(q.spare)).toBeUndefined();
  });

  it('reopens a met request whose original was deleted', async () => {
    const p = await publishedEpisode('edits.answer.reopen@example.com');
    const asked = {
      documentaryId: p.seed.documentaryId,
      momentId: p.spare.momentId,
      assetId: p.spare.assetId!,
    };
    await originalRequests.open(db(), p.episodeId, [asked], T);
    await originalRequests.meet(db(), p.spare.assetId!, T);
    expect((await p.requestOf(p.spare))?.state).toBe('met');
    expect(await p.send(swapIn(p.spare.momentId))).toMatchObject({
      waitingFor: [p.spare.momentId],
    });
    expect((await p.requestOf(p.spare))?.state).toBe('open');
  });

  it('closes the request when the swapped-in answer is taken back out', async () => {
    const p = await publishedEpisode('edits.answer.out@example.com');
    await p.send(swapIn(p.spare.momentId));
    expect(await p.send({ kind: 'dropClip', sceneIndex: 0, shotIndex: 0 }, 2)).toMatchObject({
      outcome: 'applied',
    });
    expect((await p.requestOf(p.spare))?.state).toBe('closed');
  });

  it('refuses a local-only answer as notAnAnswer', async () => {
    const p = await publishedEpisode('edits.answer.local@example.com');
    await bindings.DB.prepare('UPDATE moments SET local_only = 1 WHERE id = ?')
      .bind(p.spare.momentId)
      .run();
    expect(await p.send(swapIn(p.spare.momentId))).toEqual({
      outcome: 'refused',
      reason: 'notAnAnswer',
    });
    expect(await p.requestOf(p.spare)).toBeUndefined();
  });

  it("lets an answer's original upload with an open request, and refuses it without one", async () => {
    const p = await publishedEpisode('edits.answer.upload@example.com');
    const create = () =>
      p.phone.post(
        '/uploads',
        { assetId: p.spare.assetId, purpose: 'original', contentType: 'audio/mp4', bytes: 1000 },
        p.cookie,
      );
    const refused = await create();
    expect(refused.status).toBe(403);
    await refused.arrayBuffer();
    await p.send(swapIn(p.spare.momentId));
    const allowed = await create();
    expect(allowed.status).toBe(200);
    await allowed.arrayBuffer();
  });
});

describe('leavesDevice for answers on the server', () => {
  const answer = {
    id: Uuid.parse(crypto.randomUUID()),
    documentaryId: Uuid.parse(crypto.randomUUID()),
    authorUserId: Uuid.parse(crypto.randomUUID()),
    capturedAt: T,
    timeZone: 'Europe/Berlin',
    kind: 'answer' as const,
    questionId: Uuid.parse(crypto.randomUUID()),
    mediaAssetId: Uuid.parse(crypto.randomUUID()),
    localOnly: false,
    storylineIds: [],
    castIds: [],
    updatedAt: T,
  };

  it('allows the original of a requested answer, never without a request or when local-only', () => {
    expect(uploadsAllowed(answer, 'audio', { requested: true })).toEqual(['answer', 'original']);
    expect(uploadsAllowed(answer, 'video', { requested: true })).toEqual([
      'answer',
      'keyframe',
      'original',
    ]);
    expect(uploadsAllowed(answer, 'audio', { requested: false })).toEqual(['answer']);
    expect(uploadsAllowed({ ...answer, localOnly: true }, 'video', { requested: true })).toEqual(
      [],
    );
  });
});

describe('access', () => {
  it("gives 404 on both routes for another person's episode and for one that isn't ready", async () => {
    const p = await publishedEpisode('edits.owner@example.com');
    const other = testApp();
    const cookie = await other.signIn('edits.other@example.com');
    const body = { id: crypto.randomUUID(), appliedToVersion: 1, change: retitle('Mine now') };
    const theirs = [
      await other.call(`/episodes/${p.episodeId}/cut`, { cookie }),
      await other.post(`/episodes/${p.episodeId}/edits`, body, cookie),
    ];
    await bindings.DB.prepare("UPDATE episodes SET state = 'rendering' WHERE id = ?")
      .bind(p.episodeId)
      .run();
    const notReady = [
      await p.phone.call(`/episodes/${p.episodeId}/cut`, { cookie: p.cookie }),
      await p.phone.post(`/episodes/${p.episodeId}/edits`, body, p.cookie),
    ];
    for (const res of [...theirs, ...notReady]) {
      expect(res.status).toBe(404);
      await res.arrayBuffer();
    }
    expect(await count('episode_plans', p.episodeId)).toBe(1);
  });
});

describe('migration 0013', () => {
  it('adds episode_edits, unique by episode and seq, going with its episode', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0013_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0013_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES ('u2', '', 'u2@example.com', 1)",
    ).run();
    await MIGRATION_DB.prepare(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES ('d2', 'u2', 'Mine', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
    )
      .bind(T, T)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO episodes (id, documentary_id, number, week_start, week_end, state, plan_version, render_version, cost_cents, updated_at)
       VALUES ('e2', 'd2', 1, '2027-03-15', '2027-03-21', 'ready', 1, 1, 0, ?)`,
    )
      .bind(T)
      .run();
    await applyD1Migrations(MIGRATION_DB, next);
    const insert = (id: string, seq: number) =>
      MIGRATION_DB.prepare(
        `INSERT INTO episode_edits (id, episode_id, seq, applied_to_version, result_version, change, local_day, created_at)
         VALUES (?, 'e2', ?, 1, 2, '{}', '2027-03-21', ?)`,
      )
        .bind(id, seq, T)
        .run();
    await insert('x1', 1);
    await insert('x2', 2);
    await expect(insert('x3', 1)).rejects.toThrow();
    await MIGRATION_DB.prepare("DELETE FROM episodes WHERE id = 'e2'").run();
    const left = await MIGRATION_DB.prepare('SELECT COUNT(*) AS n FROM episode_edits').first<{
      n: number;
    }>();
    expect(left?.n).toBe(0);
  });
});
