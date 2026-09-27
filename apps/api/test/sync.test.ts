import {
  ApiError,
  Documentary,
  Me,
  SyncResponse,
  SyncChange,
  type SyncRequest,
} from '@life/contracts';
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bindings, testApp } from './session';

const T0 = '2027-03-15T08:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

/** A signed-in person with a linked documentary, on one phone (one test app). */
async function person(email: string) {
  const phone = testApp();
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
  const sync = async (request: Omit<SyncRequest, 'documentaryId'> & { documentaryId?: string }) => {
    const res = await phone.post('/sync', { documentaryId: documentary.id, ...request }, cookie);
    return res;
  };
  const ok = async (request: Omit<SyncRequest, 'documentaryId'>) => {
    const res = await sync(request);
    expect(res.status).toBe(200);
    return SyncResponse.parse(await res.json());
  };
  return { userId: me.userId, documentary, cookie, sync, ok, email };
}

function note(documentaryId: string, userId: string, over: Record<string, unknown> = {}) {
  return SyncChange.parse({
    entity: 'moment',
    row: {
      id: crypto.randomUUID(),
      documentaryId,
      authorUserId: userId,
      capturedAt: T0,
      timeZone: 'Europe/Berlin',
      kind: 'note',
      text: 'Rain on the tram window.',
      localOnly: false,
      storylineIds: [],
      castIds: [],
      updatedAt: T0,
      ...over,
    },
  });
}

function storyline(documentaryId: string, over: Record<string, unknown> = {}): SyncChange {
  return SyncChange.parse({
    entity: 'storyline',
    row: {
      id: crypto.randomUUID(),
      documentaryId,
      title: 'The new job',
      openedAt: T0,
      updatedAt: T0,
      ...over,
    },
  });
}

function photoAsset(userId: string, id = crypto.randomUUID()): SyncChange {
  return SyncChange.parse({
    entity: 'mediaAsset',
    row: {
      id,
      ownerUserId: userId,
      kind: 'photo',
      width: 3024,
      height: 4032,
      bytes: 2_000_000,
      sha256: 'a'.repeat(64),
      createdAt: T0,
    },
  });
}

function question(documentaryId: string, over: Record<string, unknown> = {}): SyncChange {
  return SyncChange.parse({
    entity: 'question',
    row: {
      id: crypto.randomUUID(),
      documentaryId,
      templateId: 'q001',
      reason: 'after_quiet_days',
      askedOn: '2027-03-15',
      text: 'What made today feel different?',
      ...over,
    },
  });
}

async function count(table: string, id: string): Promise<number> {
  const row = await bindings.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe('POST /sync', () => {
  it('stores a first sync and answers with no rows and a cursor; a second phone pulls them', async () => {
    const ada = await person('ada.sync@example.com');
    const changes = [note(ada.documentary.id, ada.userId), storyline(ada.documentary.id)];
    const first = await ada.ok({ cursor: null, changes });
    expect(first.changes).toEqual([]);
    expect(first.refused).toEqual([]);
    expect(first.cursor).toBeGreaterThan(0);

    const secondPhone = testApp();
    const cookie = await secondPhone.signIn(ada.email);
    const res = await secondPhone.post(
      '/sync',
      { documentaryId: ada.documentary.id, cursor: null, changes: [] },
      cookie,
    );
    const pulled = SyncResponse.parse(await res.json());
    expect(pulled.changes).toHaveLength(changes.length);
    expect(pulled.changes).toEqual(expect.arrayContaining(changes));
    expect(pulled.cursor).toBe(first.cursor);
  });

  it('refuses an older row as stale and keeps the stored one', async () => {
    const ada = await person('ada.stale@example.com');
    const newer = storyline(ada.documentary.id, { updatedAt: at(10), title: 'Newer' });
    await ada.ok({ cursor: null, changes: [newer] });
    const older = { entity: 'storyline', row: { ...newer.row, title: 'Older', updatedAt: at(5) } };
    const same = { entity: 'storyline', row: { ...newer.row, title: 'Same time' } };

    const res = await ada.ok({ cursor: null, changes: [older, same] as SyncChange[] });
    expect(res.refused).toEqual([
      { entity: 'storyline', id: newer.row.id, reason: 'stale' },
      { entity: 'storyline', id: newer.row.id, reason: 'stale' },
    ]);
    expect(res.changes).toContainEqual(newer);
  });

  it('refuses a local-only moment and its media, and stores nothing about them', async () => {
    const ada = await person('ada.local@example.com');
    const asset = photoAsset(ada.userId);
    const moment = note(ada.documentary.id, ada.userId, {
      kind: 'photo',
      text: undefined,
      mediaAssetId: asset.row.id,
      localOnly: true,
    });
    const res = await ada.ok({ cursor: null, changes: [moment, asset] });
    expect(res.refused).toEqual([
      { entity: 'moment', id: moment.row.id, reason: 'local_only' },
      { entity: 'mediaAsset', id: asset.row.id, reason: 'local_only' },
    ]);
    expect(await count('moments', moment.row.id)).toBe(0);
    expect(await count('media_assets', asset.row.id)).toBe(0);
    const log = await bindings.DB.prepare(
      'SELECT COUNT(*) AS n FROM change_log WHERE entity_id IN (?, ?)',
    )
      .bind(moment.row.id, asset.row.id)
      .first<{ n: number }>();
    expect(log?.n).toBe(0);
  });

  it('refuses a row of another documentary as not yours', async () => {
    const ada = await person('ada.other@example.com');
    const elsewhere = note(crypto.randomUUID(), ada.userId);
    const res = await ada.ok({ cursor: null, changes: [elsewhere] });
    expect(res.refused).toEqual([{ entity: 'moment', id: elsewhere.row.id, reason: 'not_yours' }]);
    expect(await count('moments', elsewhere.row.id)).toBe(0);
  });

  it("refuses a row id that already belongs to someone else's documentary", async () => {
    const ada = await person('ada.taken@example.com');
    const grace = await person('grace.taken@example.com');
    const hers = note(grace.documentary.id, grace.userId);
    await grace.ok({ cursor: null, changes: [hers] });
    const copy = {
      entity: 'moment',
      row: { ...hers.row, documentaryId: ada.documentary.id, updatedAt: at(60) },
    };
    const res = await ada.ok({ cursor: null, changes: [copy] as SyncChange[] });
    expect(res.refused).toEqual([{ entity: 'moment', id: hers.row.id, reason: 'not_yours' }]);
  });

  it("answers 403 for another person's documentary", async () => {
    const ada = await person('ada.forbidden@example.com');
    const grace = await person('grace.forbidden@example.com');
    const res = await ada.sync({ documentaryId: grace.documentary.id, cursor: null, changes: [] });
    expect(res.status).toBe(403);
    expect(ApiError.parse(await res.json()).error.code).toBe('forbidden');
  });

  it('syncs a deleted moment as a change', async () => {
    const ada = await person('ada.tombstone@example.com');
    const moment = note(ada.documentary.id, ada.userId);
    const { cursor } = await ada.ok({ cursor: null, changes: [moment] });
    const gone = { entity: 'moment', row: { ...moment.row, updatedAt: at(1), deletedAt: at(1) } };
    const res = await ada.ok({ cursor, changes: [gone] as SyncChange[] });
    expect(res.refused).toEqual([]);

    const other = testApp();
    const cookie = await other.signIn(ada.email);
    const pulled = SyncResponse.parse(
      await (
        await other.post(
          '/sync',
          { documentaryId: ada.documentary.id, cursor, changes: [] },
          cookie,
        )
      ).json(),
    );
    expect(pulled.changes).toEqual([gone]);
  });

  it('pages 600 changed rows as 500 and 100 with rising cursors', async () => {
    const ada = await person('ada.pages@example.com');
    let cursor: number | null = null;
    for (let batch = 0; batch < 6; batch++) {
      const changes = Array.from({ length: 100 }, () => storyline(ada.documentary.id));
      ({ cursor } = await ada.ok({ cursor, changes }));
    }

    const other = testApp();
    const cookie = await other.signIn(ada.email);
    const pull = async (from: number | null) =>
      SyncResponse.parse(
        await (
          await other.post(
            '/sync',
            { documentaryId: ada.documentary.id, cursor: from, changes: [] },
            cookie,
          )
        ).json(),
      );
    const first = await pull(null);
    expect(first.changes).toHaveLength(500);
    const second = await pull(first.cursor);
    expect(second.changes).toHaveLength(100);
    expect(second.cursor).toBeGreaterThan(first.cursor);
    const third = await pull(second.cursor);
    expect(third.changes).toEqual([]);
    expect(third.cursor).toBe(second.cursor);
  });

  it('does not echo the rows a request wrote', async () => {
    const ada = await person('ada.echo@example.com');
    const first = note(ada.documentary.id, ada.userId);
    const { cursor } = await ada.ok({ cursor: null, changes: [first] });
    const mine = storyline(ada.documentary.id);
    const res = await ada.ok({ cursor, changes: [mine] });
    expect(res.changes).toEqual([]);
    expect(res.cursor).toBeGreaterThan(cursor);
    const again = await ada.ok({ cursor: res.cursor, changes: [] });
    expect(again.changes).toEqual([]);
  });

  it('stores no cloud key a phone sends for an asset', async () => {
    const ada = await person('ada.cloud@example.com');
    const asset = photoAsset(ada.userId);
    const withKey = {
      entity: 'mediaAsset',
      row: { ...asset.row, cloudKey: 'u/other/b/c/preview' },
    };
    await ada.ok({ cursor: null, changes: [withKey] as SyncChange[] });
    const res = await ada.ok({ cursor: null, changes: [asset] });
    expect(res.refused).toEqual([{ entity: 'mediaAsset', id: asset.row.id, reason: 'stale' }]);
    expect(res.changes).toContainEqual(asset);
  });

  it('never lets an unanswered copy of a question clear its answer', async () => {
    const ada = await person('ada.question@example.com');
    const answer = note(ada.documentary.id, ada.userId);
    const q = question(ada.documentary.id, { answeredByMomentId: answer.row.id });
    await ada.ok({ cursor: null, changes: [answer, q] });

    const phoneB = testApp();
    const cookie = await phoneB.signIn(ada.email);
    const unanswered = question(ada.documentary.id, { id: q.row.id });
    const res = SyncResponse.parse(
      await (
        await phoneB.post(
          '/sync',
          { documentaryId: ada.documentary.id, cursor: null, changes: [unanswered] },
          cookie,
        )
      ).json(),
    );
    expect(res.refused).toEqual([{ entity: 'question', id: q.row.id, reason: 'stale' }]);
    expect(res.changes).toContainEqual(q);
  });

  it('takes a new answer once the stored answer moment is deleted', async () => {
    const ada = await person('ada.reanswer@example.com');
    const first = note(ada.documentary.id, ada.userId);
    const q = question(ada.documentary.id, { answeredByMomentId: first.row.id });
    const { cursor } = await ada.ok({ cursor: null, changes: [first, q] });
    const tombstone = SyncChange.parse({
      entity: 'moment',
      row: { ...first.row, updatedAt: at(5), deletedAt: at(5) },
    });
    await ada.ok({ cursor, changes: [tombstone] });

    const second = note(ada.documentary.id, ada.userId);
    const again = question(ada.documentary.id, { id: q.row.id, answeredByMomentId: second.row.id });
    const res = await ada.ok({ cursor: null, changes: [second, again] });
    expect(res.refused).toEqual([]);
    const pulled = await ada.ok({ cursor: null, changes: [] });
    expect(pulled.changes).toContainEqual(again);
  });
});

describe('the sync migration', () => {
  it('adds the sync tables and keeps the rows before it', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => !m.name.startsWith('0002_'));
    const sync = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0002_'));
    expect(sync).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    const userId = crypto.randomUUID();
    const documentaryId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
    )
      .bind(userId, `${userId}@example.com`)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO documentaries (id, owner_user_id, title, kind, time_zone, episode_day, episode_hour, created_at, updated_at)
       VALUES (?, ?, 'Kept', 'solo', 'Europe/Berlin', 0, 18, ?, ?)`,
    )
      .bind(documentaryId, userId, T0, T0)
      .run();

    await applyD1Migrations(MIGRATION_DB, sync);
    const tables = await MIGRATION_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    const names = tables.results.map((t) => t.name);
    for (const table of [
      'moments',
      'media_assets',
      'questions',
      'storylines',
      'cast_members',
      'change_log',
    ]) {
      expect(names).toContain(table);
    }
    const kept = await MIGRATION_DB.prepare('SELECT title FROM documentaries WHERE id = ?')
      .bind(documentaryId)
      .first<{ title: string }>();
    expect(kept?.title).toBe('Kept');
  });
});
