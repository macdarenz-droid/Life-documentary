import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { Uuid } from '@life/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { database } from '../src/data/db';
import * as deletionRequests from '../src/data/repositories/deletionRequests';
import * as devicesRepo from '../src/data/repositories/devices';
import { pushContext, pushTo } from '../src/pipeline/deliver/push';
import type { PushMessage } from '../src/pipeline/ports';
import { pipelineProviders } from '../src/providers';
import { EXPO_PUSH_URL, expoPusher, type Fetch } from '../src/providers/expoPush/pusher';
import { fixtures } from '../src/providers/fixture';
import { bindings, testApp } from './session';

const T = '2027-03-21T18:00:00.000Z';
const token = (n: number) => `ExponentPushToken[token-${n}]`;

async function newUser(): Promise<Uuid> {
  const id = Uuid.parse(crypto.randomUUID());
  await bindings.DB.prepare(
    "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
  )
    .bind(id, `${id}@example.com`)
    .run();
  return id;
}

const device = (pushToken?: string) => ({
  id: Uuid.parse(crypto.randomUUID()),
  platform: 'ios' as const,
  appVersion: '1.0.0',
  ...(pushToken ? { pushToken } : {}),
});

describe('push tokens on devices', () => {
  const db = database(bindings.DB);

  it('moves a token registered on a new device id off the old row', async () => {
    const userId = await newUser();
    const old = device(token(1));
    await devicesRepo.upsert(db, userId, old, T);
    const next = device(token(1));
    await devicesRepo.upsert(db, userId, next, T);
    const rows = await devicesRepo.listByUser(db, userId);
    expect(rows.find((d) => d.id === old.id)?.pushToken).toBeNull();
    expect(rows.find((d) => d.id === next.id)?.pushToken).toBe(token(1));
    expect(await devicesRepo.tokensFor(db, userId)).toEqual([token(1)]);
  });

  it('keeps the stored token when a registration has none', async () => {
    const userId = await newUser();
    const phone = device(token(2));
    await devicesRepo.upsert(db, userId, phone, T);
    await devicesRepo.upsert(
      db,
      userId,
      { id: phone.id, platform: phone.platform, appVersion: phone.appVersion },
      T,
    );
    expect(await devicesRepo.tokensFor(db, userId)).toEqual([token(2)]);
  });

  it('refuses a token that is not an Expo push token', async () => {
    const { post, signIn } = testApp();
    const cookie = await signIn('not-a-token@example.com');
    const res = await post('/devices', { ...device(), pushToken: 'abc' }, cookie);
    expect(res.status).toBe(400);
  });

  it('clears the tokens when the account deletion is asked for', async () => {
    const { post, signIn } = testApp();
    const cookie = await signIn('push-delete@example.com');
    const phone = device(token(3));
    expect((await post('/devices', phone, cookie)).status).toBe(200);
    expect((await post('/account/delete', undefined, cookie)).status).toBe(204);
    const row = await bindings.DB.prepare('SELECT push_token FROM devices WHERE id = ?')
      .bind(phone.id)
      .first<{ push_token: string | null }>();
    expect(row).toEqual({ push_token: null });
  });
});

describe('migration 0009', () => {
  it('adds a nullable push_token to devices and keeps earlier rows', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0009_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0009_'));
    expect(next).toHaveLength(1);
    await applyD1Migrations(MIGRATION_DB, before);
    const userId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    await MIGRATION_DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, '', ?, 1)",
    )
      .bind(userId, `${userId}@example.com`)
      .run();
    await MIGRATION_DB.prepare(
      `INSERT INTO devices (id, user_id, platform, app_version, created_at, last_seen_at)
       VALUES (?, ?, 'android', '1.0.0', ?, ?)`,
    )
      .bind(deviceId, userId, T, T)
      .run();

    await applyD1Migrations(MIGRATION_DB, next);
    const kept = await MIGRATION_DB.prepare('SELECT platform, push_token FROM devices WHERE id = ?')
      .bind(deviceId)
      .first<{ platform: string; push_token: string | null }>();
    expect(kept).toEqual({ platform: 'android', push_token: null });
  });
});

function stubFetch(answer: (messages: { to: string }[]) => Response) {
  const calls: { url: string; init: RequestInit; messages: Record<string, unknown>[] }[] = [];
  const fetcher: Fetch = (url, init) => {
    const messages = JSON.parse(init.body as string) as { to: string }[];
    calls.push({ url, init, messages });
    return Promise.resolve(answer(messages));
  };
  return { fetcher, calls };
}

const okTickets = (messages: { to: string }[]) =>
  Response.json({ data: messages.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });

const visible: Omit<PushMessage, 'to'> = {
  title: 'Episode 12 is ready',
  data: { episodeId: '00000000-0000-4000-8000-000000000012' },
  silent: false,
};

describe('the Expo pusher', () => {
  it('sends 150 messages in two calls', async () => {
    const { fetcher, calls } = stubFetch(okTickets);
    const messages = Array.from({ length: 150 }, (_, i) => ({ ...visible, to: token(i) }));
    const results = await expoPusher(undefined, fetcher).send(messages);
    expect(calls.map((c) => c.messages.length)).toEqual([100, 50]);
    expect(calls.every((c) => c.url === EXPO_PUSH_URL)).toBe(true);
    expect(results).toHaveLength(150);
    expect(results.every((r) => r.outcome === 'sent')).toBe(true);
    expect(results[120]?.to).toBe(token(120));
  });

  it('writes the visible and the silent bodies', async () => {
    const { fetcher, calls } = stubFetch(okTickets);
    await expoPusher(undefined, fetcher).send([
      { ...visible, to: token(1) },
      { data: { originals: '1' }, silent: true, to: token(2) },
    ]);
    expect(calls[0]?.messages).toEqual([
      {
        to: token(1),
        title: 'Episode 12 is ready',
        data: { episodeId: '00000000-0000-4000-8000-000000000012' },
        sound: 'default',
        priority: 'high',
        channelId: 'episodes',
      },
      { to: token(2), data: { originals: '1' }, contentAvailable: true, priority: 'normal' },
    ]);
  });

  it('sends the bearer header only with the secret', async () => {
    const without = stubFetch(okTickets);
    await expoPusher(undefined, without.fetcher).send([{ ...visible, to: token(1) }]);
    expect(new Headers(without.calls[0]?.init.headers).has('authorization')).toBe(false);
    const withSecret = stubFetch(okTickets);
    await expoPusher('expo-secret', withSecret.fetcher).send([{ ...visible, to: token(1) }]);
    expect(new Headers(withSecret.calls[0]?.init.headers).get('authorization')).toBe(
      'Bearer expo-secret',
    );
  });

  it('maps a DeviceNotRegistered ticket, and reads the others leniently', async () => {
    const { fetcher } = stubFetch(() =>
      Response.json({
        data: [
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' }, extra: 1 },
          { status: 'error', details: { error: 'MessageRateExceeded' } },
          'not a ticket',
        ],
      }),
    );
    const results = await expoPusher(undefined, fetcher).send(
      [1, 2, 3, 4].map((n) => ({ ...visible, to: token(n) })),
    );
    expect(results.map((r) => r.outcome)).toEqual([
      'deviceNotRegistered',
      'failed',
      'failed',
      'failed',
    ]);
  });

  it('marks a batch failed on a 500, with no token in the error', async () => {
    const { fetcher } = stubFetch(() => new Response('boom', { status: 500 }));
    const results = await expoPusher(undefined, fetcher).send([
      { ...visible, to: token(7) },
      { ...visible, to: token(8) },
    ]);
    expect(results.map((r) => r.outcome)).toEqual(['failed', 'failed']);
    for (const r of results) {
      expect(r.error).toBeDefined();
      expect(r.error).not.toContain('PushToken');
      expect(r.error).not.toContain('token-');
    }
  });

  it('is the fixture with PROVIDERS fixture, and the Expo adapter otherwise', () => {
    expect(pipelineProviders(bindings).pusher).toBe(fixtures.pusher);
    expect(pipelineProviders({ ...bindings, PROVIDERS: 'real' }).pusher).not.toBe(fixtures.pusher);
  });
});

describe('pushTo', () => {
  const ctx = pushContext(bindings);
  beforeEach(() => fixtures.reset());

  it("sends to each of the person's phones and clears a dead token", async () => {
    const userId = await newUser();
    await devicesRepo.upsert(ctx.db, userId, device(token(20)), T);
    await devicesRepo.upsert(ctx.db, userId, device(token(21)), T);
    fixtures.pusher.outcomes.set(token(21), 'deviceNotRegistered');
    const results = await pushTo(ctx, userId, visible);
    expect(fixtures.pusher.sent.map((m) => m.to).sort()).toEqual([token(20), token(21)]);
    expect(results).toHaveLength(2);
    expect(await devicesRepo.tokensFor(ctx.db, userId)).toEqual([token(20)]);
  });

  it('sends nothing after a deletion request', async () => {
    const userId = await newUser();
    await devicesRepo.upsert(ctx.db, userId, device(token(30)), T);
    await deletionRequests.request(ctx.db, userId, T);
    expect(await pushTo(ctx, userId, visible)).toEqual([]);
    expect(fixtures.pusher.sent).toEqual([]);
  });
});
