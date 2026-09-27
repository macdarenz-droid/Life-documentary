import {
  ApiError,
  Documentary,
  LinkDocumentaryResult,
  Me,
  type LinkDocumentary,
} from '@life/contracts';
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bindings, testApp } from './session';

const DAY_MS = 24 * 60 * 60 * 1000;

function localDocumentary(id: string): LinkDocumentary {
  return Documentary.parse({
    id,
    ownerUserId: '0e6b2a44-7d51-4c3f-9a8e-2f1d0c9b8a71',
    title: 'My documentary',
    kind: 'solo',
    timeZone: 'Europe/Berlin',
    episodeDay: 0,
    episodeHour: 18,
    createdAt: '2027-03-01T08:00:00.000Z',
    updatedAt: '2027-03-01T08:00:00.000Z',
  });
}

describe('account routes', () => {
  it('answers 401 in the ApiError shape without a session', async () => {
    const { call, post } = testApp();
    const responses = [
      await call('/me'),
      await post('/devices', { id: crypto.randomUUID(), platform: 'ios', appVersion: '1.0.0' }),
      await post('/documentaries/link', localDocumentary(crypto.randomUUID())),
      await post('/account/delete', undefined),
      await post('/account/delete/cancel', undefined),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(ApiError.parse(await res.json()).error.code).toBe('unauthorized');
    }
  });

  it('refuses a body that does not fit the contract', async () => {
    const { post, signIn } = testApp();
    const cookie = await signIn('body@example.com');
    const res = await post('/devices', { id: 'not-a-uuid', platform: 'ios' }, cookie);
    expect(res.status).toBe(400);
    expect(ApiError.parse(await res.json()).error.code).toBe('bad_request');
  });

  it('links a documentary once, returns it again, and refuses it to someone else', async () => {
    const { call, post, signIn } = testApp();
    const ada = await signIn('ada.link@example.com');
    const me = Me.parse(await (await call('/me', { cookie: ada })).json());
    const local = localDocumentary(crypto.randomUUID());

    const first = await post('/documentaries/link', local, ada);
    expect(first.status).toBe(200);
    const stored = LinkDocumentaryResult.parse(await first.json()).documentary;
    expect(stored.id).toBe(local.id);
    expect(stored.ownerUserId).toBe(me.userId);
    expect(stored.title).toBe(local.title);

    const second = await post('/documentaries/link', { ...local, title: 'Renamed' }, ada);
    expect(second.status).toBe(200);
    expect(LinkDocumentaryResult.parse(await second.json()).documentary).toEqual(stored);

    const other = await signIn('grace.link@example.com');
    const taken = await post('/documentaries/link', local, other);
    expect(taken.status).toBe(409);
    expect(ApiError.parse(await taken.json()).error.code).toBe('conflict');

    const after = Me.parse(await (await call('/me', { cookie: ada })).json());
    expect(after.documentaries).toEqual([stored]);
  });

  it('keeps one row per phone and moves last_seen_at', async () => {
    const { post, signIn } = testApp();
    const cookie = await signIn('phone@example.com');
    const id = crypto.randomUUID();
    expect(
      (await post('/devices', { id, platform: 'ios', appVersion: '1.0.0' }, cookie)).status,
    ).toBe(200);
    const before = await bindings.DB.prepare('SELECT last_seen_at FROM devices WHERE id = ?')
      .bind(id)
      .first<{ last_seen_at: string }>();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(
      (await post('/devices', { id, platform: 'ios', appVersion: '1.1.0' }, cookie)).status,
    ).toBe(200);
    const rows = await bindings.DB.prepare(
      'SELECT app_version, last_seen_at FROM devices WHERE id = ?',
    )
      .bind(id)
      .all<{ app_version: string; last_seen_at: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.app_version).toBe('1.1.0');
    expect(Date.parse(rows.results[0]!.last_seen_at)).toBeGreaterThan(
      Date.parse(before!.last_seen_at),
    );
  });

  it('opens a deletion request 30 days out, ends every session, and can be cancelled', async () => {
    const { call, post, signIn } = testApp();
    const email = 'leaving@example.com';
    const first = await signIn(email);
    const second = await signIn(email);

    const asked = Date.now();
    expect((await post('/account/delete', undefined, first)).status).toBe(204);
    expect((await call('/me', { cookie: first })).status).toBe(401);
    expect((await call('/me', { cookie: second })).status).toBe(401);

    const again = await signIn(email);
    const me = Me.parse(await (await call('/me', { cookie: again })).json());
    expect(me.deletion).not.toBeNull();
    const days = (Date.parse(me.deletion!.purgeAfter) - asked) / DAY_MS;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);

    expect((await post('/account/delete/cancel', undefined, again)).status).toBe(204);
    expect(Me.parse(await (await call('/me', { cookie: again })).json()).deletion).toBeNull();
    expect((await post('/account/delete/cancel', undefined, again)).status).toBe(404);
  });
});

describe('the product migration', () => {
  it('adds the three tables to the auth-only database and keeps its rows', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const [auth, ...rest] = TEST_MIGRATIONS;
    expect(auth!.name).toMatch(/^0000_/);
    await applyD1Migrations(MIGRATION_DB, [auth!]);
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
    )
      .bind('5c1e7a2b-3d4f-4a5b-8c6d-7e8f9a0b1c2d', 'kept@example.com')
      .run();

    await applyD1Migrations(MIGRATION_DB, rest);
    const tables = await MIGRATION_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = tables.results.map((t) => t.name);
    for (const table of ['documentaries', 'devices', 'deletion_requests']) {
      expect(names).toContain(table);
    }
    const kept = await MIGRATION_DB.prepare('SELECT email FROM user').all<{ email: string }>();
    expect(kept.results).toEqual([{ email: 'kept@example.com' }]);
  });
});
