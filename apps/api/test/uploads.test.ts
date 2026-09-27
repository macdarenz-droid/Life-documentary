import {
  ApiError,
  CreateUploadResult,
  Documentary,
  Me,
  SyncChange,
  SyncResponse,
  UPLOAD_PART_SIZE,
  UploadDone,
  UploadedPart,
  type UploadPurpose,
} from '@life/contracts';
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bindings, testApp } from './session';

const T0 = '2027-03-15T08:00:00.000Z';
const MiB = 1024 * 1024;

/** 12 MiB of bytes that differ from part to part. */
const FIXTURE = new Uint8Array(12 * MiB).map((_, i) => (i * 31 + (i >> 20)) & 255);

async function sha256(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A signed-in person with a linked documentary and one synced answer (a video) or photo. */
async function person(
  email: string,
  options: {
    localOnly?: boolean;
    kind?: 'answer' | 'photo' | 'clip';
    purpose?: UploadPurpose;
    media?: R2Bucket;
  } = {},
) {
  const phone = testApp(options.media ? { MEDIA: options.media } : {});
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

  const kind = options.kind ?? 'answer';
  const assetId = crypto.randomUUID();
  const asset = SyncChange.parse({
    entity: 'mediaAsset',
    row: {
      id: assetId,
      ownerUserId: me.userId,
      kind: kind === 'photo' ? 'photo' : 'video',
      ...(kind === 'photo' ? {} : { durationMs: 9000 }),
      width: 1080,
      height: 1920,
      bytes: FIXTURE.byteLength,
      sha256: 'a'.repeat(64),
      createdAt: T0,
    },
  });
  const moment = SyncChange.parse({
    entity: 'moment',
    row: {
      id: crypto.randomUUID(),
      documentaryId: documentary.id,
      authorUserId: me.userId,
      capturedAt: T0,
      timeZone: 'Europe/Berlin',
      kind,
      ...(kind === 'answer' ? { questionId: crypto.randomUUID() } : {}),
      mediaAssetId: assetId,
      localOnly: options.localOnly ?? false,
      storylineIds: [],
      castIds: [],
      updatedAt: T0,
    },
  });
  const synced = await phone.post(
    '/sync',
    { documentaryId: documentary.id, cursor: null, changes: [asset, moment] },
    cookie,
  );
  const { cursor } = SyncResponse.parse(await synced.json());

  const purpose =
    options.purpose ?? (kind === 'answer' ? 'answer' : kind === 'photo' ? 'preview' : 'keyframe');
  const base = `/uploads/${assetId}/${purpose}`;
  const create = (bytes = FIXTURE.byteLength, as = cookie) =>
    phone.post('/uploads', { assetId, purpose, contentType: 'video/mp4', bytes }, as);
  const put = (n: number, bytes: Uint8Array, as = cookie) =>
    phone.call(`${base}/parts/${n}`, {
      method: 'PUT',
      body: bytes.slice(),
      headers: { 'content-length': String(bytes.byteLength) },
      cookie: as,
    });
  const complete = (parts: { partNumber: number; etag: string }[]) =>
    phone.post(`${base}/complete`, { parts }, cookie);
  return { phone, cookie, me, documentary, assetId, purpose, cursor, create, put, complete };
}

const part = (n: number) =>
  FIXTURE.subarray((n - 1) * UPLOAD_PART_SIZE, Math.min(n * UPLOAD_PART_SIZE, FIXTURE.byteLength));

async function sendAll(p: Awaited<ReturnType<typeof person>>, numbers = [1, 2, 3]) {
  const parts: { partNumber: number; etag: string }[] = [];
  for (const n of numbers) {
    const res = await p.put(n, part(n));
    expect(res.status).toBe(200);
    parts.push(UploadedPart.parse(await res.json()));
  }
  return parts;
}

/** The real MEDIA bucket, counting the multipart uploads started through it. */
function countingMedia() {
  const counter = { starts: 0 };
  const media = new Proxy(bindings.MEDIA, {
    get(target, prop) {
      if (prop === 'createMultipartUpload') {
        return (...args: Parameters<R2Bucket['createMultipartUpload']>) => {
          counter.starts += 1;
          return target.createMultipartUpload(...args);
        };
      }
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  return { media, counter };
}

async function openUploads(assetId: string): Promise<number> {
  const row = await bindings.DB.prepare('SELECT COUNT(*) AS n FROM uploads WHERE asset_id = ?')
    .bind(assetId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe('uploads', () => {
  it('stores a 12 MiB file sent in parts of 5, 5 and 2 MiB byte for byte', async () => {
    const p = await person('ada.upload@example.com');
    const created = await p.create();
    expect(created.status).toBe(200);
    expect(CreateUploadResult.parse(await created.json())).toMatchObject({
      partSize: UPLOAD_PART_SIZE,
      partCount: 3,
    });
    expect([1, 2, 3].map((n) => part(n).byteLength)).toEqual([5 * MiB, 5 * MiB, 2 * MiB]);

    const done = await p.complete(await sendAll(p));
    expect(done.status).toBe(200);
    const { cloudKey } = UploadDone.parse(await done.json());
    expect(cloudKey).toBe(`tmp/${p.me.userId}/${p.documentary.id}/${p.assetId}/answer`);
    const object = await bindings.MEDIA.get(cloudKey);
    expect(await sha256(await object!.arrayBuffer())).toBe(await sha256(FIXTURE));
    expect(await openUploads(p.assetId)).toBe(0);
  });

  it('gives the same open upload when it is created again', async () => {
    const { media, counter } = countingMedia();
    const p = await person('ada.again@example.com', { media });
    const first = CreateUploadResult.parse(await (await p.create()).json());
    const second = CreateUploadResult.parse(await (await p.create()).json());
    expect(second).toEqual(first);
    expect(counter.starts).toBe(1);
    expect(await openUploads(p.assetId)).toBe(1);
  });

  it('refuses a part of the wrong size and a body over the limit', async () => {
    const p = await person('ada.size@example.com');
    await p.create();
    const short = await p.put(1, part(1).subarray(0, 4 * MiB));
    expect(short.status).toBe(400);
    expect(ApiError.parse(await short.json()).error.code).toBe('bad_request');
    expect((await p.put(3, part(2))).status).toBe(400);
    expect((await p.put(1, new Uint8Array(6 * MiB))).status).toBe(400);
    expect((await p.put(4, part(3))).status).toBe(400);
  });

  it('refuses to complete with a part missing', async () => {
    const p = await person('ada.missing@example.com');
    await p.create();
    const parts = await sendAll(p, [1, 3]);
    expect((await p.complete(parts)).status).toBe(400);
    const claimed = [...parts, { partNumber: 2, etag: 'not-a-real-etag' }];
    expect((await p.complete(claimed)).status).toBe(400);
    expect(await openUploads(p.assetId)).toBe(1);
  });

  it('keeps the last copy of a part sent twice', async () => {
    const p = await person('ada.resend@example.com');
    await p.create();
    const [one, , three] = await sendAll(p);
    // Part 2 first goes up with the wrong bytes, then again with the right ones.
    expect((await p.put(2, new Uint8Array(5 * MiB).fill(9))).status).toBe(200);
    const two = await (await p.put(2, part(2))).json<{ partNumber: number; etag: string }>();
    const done = await p.complete([one!, two, three!]);
    expect(done.status).toBe(200);
    const object = await bindings.MEDIA.get(UploadDone.parse(await done.json()).cloudKey);
    expect(await sha256(await object!.arrayBuffer())).toBe(await sha256(FIXTURE));
  });

  it('refuses a local-only asset and starts no upload', async () => {
    const { media, counter } = countingMedia();
    const p = await person('ada.kept@example.com', { localOnly: true, media });
    const res = await p.create();
    expect(counter.starts).toBe(0);
    expect(res.status).toBe(403);
    expect(ApiError.parse(await res.json()).error.code).toBe('forbidden');
    expect(await openUploads(p.assetId)).toBe(0);
    const prefix = `u/${p.me.userId}/`;
    expect((await bindings.MEDIA.list({ prefix })).objects).toEqual([]);
  });

  it('refuses a purpose the moment does not allow', async () => {
    const p = await person('ada.photo@example.com', { kind: 'photo' });
    const original = await p.phone.post(
      '/uploads',
      { assetId: p.assetId, purpose: 'original', contentType: 'image/jpeg', bytes: 1000 },
      p.cookie,
    );
    expect(original.status).toBe(403);
    expect((await p.create(1000)).status).toBe(200);
  });

  it("ignores another person's moment that names your asset", async () => {
    const ada = await person('ada.named@example.com', { kind: 'photo' });
    const bo = await person('bo.naming@example.com');
    const theirs = SyncChange.parse({
      entity: 'moment',
      row: {
        id: crypto.randomUUID(),
        documentaryId: bo.documentary.id,
        authorUserId: bo.me.userId,
        capturedAt: T0,
        timeZone: 'Europe/Berlin',
        kind: 'answer',
        questionId: crypto.randomUUID(),
        mediaAssetId: ada.assetId,
        localOnly: false,
        storylineIds: [],
        castIds: [],
        updatedAt: T0,
      },
    });
    const pushed = await bo.phone.post(
      '/sync',
      { documentaryId: bo.documentary.id, cursor: null, changes: [theirs] },
      bo.cookie,
    );
    expect(pushed.status).toBe(200);
    const answer = await ada.phone.post(
      '/uploads',
      { assetId: ada.assetId, purpose: 'answer', contentType: 'video/mp4', bytes: 1000 },
      ada.cookie,
    );
    expect(answer.status).toBe(403);
    expect((await ada.create(1000)).status).toBe(200);
  });

  it("refuses another person's asset", async () => {
    const ada = await person('ada.owner@example.com');
    const bo = testApp();
    const boCookie = await bo.signIn('bo.other@example.com');
    expect((await ada.create(FIXTURE.byteLength, boCookie)).status).toBe(403);
    expect(await openUploads(ada.assetId)).toBe(0);
    await ada.create();
    expect((await ada.put(1, part(1), boCookie)).status).toBe(403);
  });

  it('keeps a completed answer under tmp/ and leaves the asset without a cloud key', async () => {
    const p = await person('ada.cloudkey@example.com');
    await p.create();
    const done = UploadDone.parse(await (await p.complete(await sendAll(p))).json());
    expect(done.cloudKey.startsWith(`tmp/${p.me.userId}/`)).toBe(true);
    expect(await bindings.MEDIA.get(done.cloudKey)).not.toBeNull();
    const stored = await bindings.DB.prepare('SELECT cloud_key FROM media_assets WHERE id = ?')
      .bind(p.assetId)
      .first<{ cloud_key: string | null }>();
    expect(stored?.cloud_key).toBeNull();
    const res = await p.phone.post(
      '/sync',
      { documentaryId: p.documentary.id, cursor: p.cursor, changes: [] },
      p.cookie,
    );
    const pulled = SyncResponse.parse(await res.json());
    expect(pulled.changes.filter((c) => c.row.id === p.assetId)).toEqual([]);
  });

  it('keeps a completed photo preview under tmp/', async () => {
    const p = await person('ada.preview@example.com', { kind: 'photo' });
    await p.create();
    const done = UploadDone.parse(await (await p.complete(await sendAll(p))).json());
    expect(done.cloudKey).toBe(`tmp/${p.me.userId}/${p.documentary.id}/${p.assetId}/preview`);
    expect(await bindings.MEDIA.get(done.cloudKey)).not.toBeNull();
  });

  it('accepts a keyframe for a library clip and keeps it under tmp/', async () => {
    const p = await person('ada.clip@example.com', { kind: 'clip' });
    expect((await p.create()).status).toBe(200);
    const done = UploadDone.parse(await (await p.complete(await sendAll(p))).json());
    expect(done.cloudKey.startsWith(`tmp/${p.me.userId}/`)).toBe(true);
    expect(done.cloudKey).toBe(`tmp/${p.me.userId}/${p.documentary.id}/${p.assetId}/keyframe`);
    expect(await bindings.MEDIA.get(done.cloudKey)).not.toBeNull();
  });

  it('refuses an answer upload for a library clip', async () => {
    const p = await person('ada.clipanswer@example.com', { kind: 'clip', purpose: 'answer' });
    const res = await p.create();
    expect(res.status).toBe(403);
    expect(ApiError.parse(await res.json()).error.code).toBe('forbidden');
    expect(await openUploads(p.assetId)).toBe(0);
  });

  it('refuses every purpose for a local-only moment', async () => {
    const { media, counter } = countingMedia();
    const p = await person('ada.keptall@example.com', { localOnly: true, media });
    for (const purpose of ['answer', 'preview', 'keyframe', 'original'] as const) {
      const res = await p.phone.post(
        '/uploads',
        { assetId: p.assetId, purpose, contentType: 'image/jpeg', bytes: 1000 },
        p.cookie,
      );
      expect(res.status).toBe(403);
    }
    expect(counter.starts).toBe(0);
    expect(await openUploads(p.assetId)).toBe(0);
  });

  it('keeps the completed cloud key when a later sync sends another', async () => {
    const p = await person('ada.keepkey@example.com');
    // Only a completed original sets the key, and originals wait for Cloud backup (P23), so the test
    // writes the key the completion would.
    const done = { cloudKey: `u/${p.me.userId}/${p.documentary.id}/${p.assetId}/original` };
    await bindings.DB.prepare('UPDATE media_assets SET cloud_key = ? WHERE id = ?')
      .bind(done.cloudKey, p.assetId)
      .run();
    const asset = SyncChange.parse({
      entity: 'mediaAsset',
      row: {
        id: p.assetId,
        ownerUserId: p.me.userId,
        kind: 'video',
        durationMs: 9000,
        width: 1080,
        height: 1920,
        bytes: FIXTURE.byteLength,
        sha256: 'b'.repeat(64),
        createdAt: T0,
        cloudKey: 'u/other/x/y/answer',
      },
    });
    const res = await p.phone.post(
      '/sync',
      { documentaryId: p.documentary.id, cursor: null, changes: [asset] },
      p.cookie,
    );
    expect(SyncResponse.parse(await res.json()).refused).toEqual([]);
    const after = await bindings.DB.prepare(
      'SELECT cloud_key, sha256 FROM media_assets WHERE id = ?',
    )
      .bind(p.assetId)
      .first<{ cloud_key: string; sha256: string }>();
    expect(after).toEqual({ cloud_key: done.cloudKey, sha256: 'b'.repeat(64) });
  });

  it('aborts an open upload', async () => {
    const p = await person('ada.abort@example.com');
    await p.create();
    const res = await p.phone.call(`/uploads/${p.assetId}/answer`, {
      method: 'DELETE',
      cookie: p.cookie,
    });
    expect(res.status).toBe(204);
    expect(await openUploads(p.assetId)).toBe(0);
  });
});

describe('the uploads migration', () => {
  it('adds the uploads table and keeps the rows before it', async () => {
    const { MIGRATION_DB, TEST_MIGRATIONS } = env as unknown as {
      MIGRATION_DB: D1Database;
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
    };
    const before = TEST_MIGRATIONS.filter((m) => m.name < '0003_');
    const next = TEST_MIGRATIONS.filter((m) => m.name.startsWith('0003_'));
    expect(next).toHaveLength(1);
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

    await applyD1Migrations(MIGRATION_DB, next);
    const table = await MIGRATION_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'uploads'",
    ).first<{ name: string }>();
    expect(table?.name).toBe('uploads');
    const kept = await MIGRATION_DB.prepare('SELECT title FROM documentaries WHERE id = ?')
      .bind(documentaryId)
      .first<{ title: string }>();
    expect(kept?.title).toBe('Kept');
  });
});
