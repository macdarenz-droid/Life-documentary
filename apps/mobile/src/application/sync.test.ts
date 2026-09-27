import { Moment, Uuid, type Documentary, type SyncChange, type SyncRequest } from '@life/contracts';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as syncState from '../data/repositories/syncState';
import { afterSignIn } from './account';
import { openLocalDocumentary } from './bootstrap';
import { captureMoment, type MediaInput } from './captureMoment';
import { syncIfSignedIn, syncNow } from './sync';
import { fakeSyncApi } from './testing/fakeSyncApi';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { todayQuestion } from './todayQuestion';

const SOURCE = 'tmp/source.bin';
const photo: MediaInput = { sourcePath: SOURCE, mediaKind: 'photo', width: 1200, height: 800 };
const video: MediaInput = {
  sourcePath: SOURCE,
  mediaKind: 'video',
  durationMs: 9000,
  width: 1080,
  height: 1920,
};
const OTHER_ID = '00000000-0000-4000-8000-00000000ff01';
const ACCOUNT_ID = Uuid.parse('00000000-0000-4000-8000-00000000aa01');

function storylineRow(documentary: Documentary) {
  return {
    id: Uuid.parse('00000000-0000-4000-8000-00000000bb01'),
    documentaryId: documentary.id,
    title: 'The new job',
    openedAt: '2027-03-15T08:00:00Z',
    updatedAt: '2027-03-15T08:00:00Z',
  };
}

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  store.io.files.set(
    SOURCE,
    new Uint8Array(2000).map((_, i) => i & 255),
  );
  return { store, clock, ids, documentary, api: fakeSyncApi() };
}

const requests = (sent: string[]) => sent.map((s) => JSON.parse(s) as SyncRequest);
const pushedIds = (sent: string[]) =>
  requests(sent).flatMap((r) => r.changes.map((c) => `${c.entity}:${c.row.id}`));

function note(documentary: Documentary, id: string, updatedAt: string, text: string): Moment {
  return Moment.parse({
    id,
    documentaryId: documentary.id,
    authorUserId: documentary.ownerUserId,
    capturedAt: '2027-03-15T08:00:00Z',
    timeZone: 'Europe/Berlin',
    kind: 'note',
    text,
    storylineIds: [],
    castIds: [],
    localOnly: false,
    updatedAt,
  });
}

describe('syncNow', () => {
  it('pushes a new capture once', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    const moment = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'A slow morning.',
      localOnly: false,
    });
    expect(await syncNow(store, clock, api, documentary)).toMatchObject({ status: 'synced' });
    clock.set('2027-03-15T10:00:00Z');
    expect(await syncNow(store, clock, api, documentary)).toMatchObject({ status: 'synced' });
    expect(pushedIds(api.sent).filter((k) => k === `moment:${moment.id}`)).toHaveLength(1);
    expect(api.rows.get(`moment:${moment.id}`)?.row).toEqual(moment);
  });

  it('never sends a local-only moment or its media, and no device-only field', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    const kept = await captureMoment(store, clock, ids, {
      kind: 'photo',
      media: photo,
      localOnly: true,
    });
    store.io.files.set(
      SOURCE,
      new Uint8Array(2000).map((_, i) => i & 255),
    );
    const shared = await captureMoment(store, clock, ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    await syncNow(store, clock, api, documentary);

    const ids_ = pushedIds(api.sent);
    expect(ids_).not.toContain(`moment:${kept.id}`);
    expect(ids_).not.toContain(`mediaAsset:${kept.mediaAssetId}`);
    expect(ids_).toContain(`moment:${shared.id}`);
    expect(ids_).toContain(`mediaAsset:${shared.mediaAssetId}`);
    const json = api.sent.join('\n');
    expect(json).not.toContain(kept.id);
    expect(json).not.toContain(kept.mediaAssetId);
    for (const field of [
      'localPath',
      'wrappedKey',
      'posterPath',
      'posterWrappedKey',
      'uploadState',
    ]) {
      expect(json).not.toContain(`"${field}"`);
    }
  });

  it('does not send the id of a local-only answer on its question', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    const question = await todayQuestion(store, documentary, clock, ids);
    const answer = await captureMoment(store, clock, ids, {
      kind: 'answer',
      questionId: question.id,
      media: video,
      localOnly: true,
    });
    await syncNow(store, clock, api, documentary);
    expect(pushedIds(api.sent)).toContain(`question:${question.id}`);
    expect(api.sent.join('\n')).not.toContain(answer.id);
  });

  it('lets a newer pulled row replace the local one, and not an older one', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    const a = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'First',
      localOnly: false,
    });
    const b = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'Second',
      localOnly: false,
    });
    await syncNow(store, clock, api, documentary);

    // Another phone edits both on the server: one later than the local copy, one earlier.
    api.seed({
      entity: 'moment',
      row: { ...a, text: 'First, edited', updatedAt: '2027-03-15T11:00:00Z' },
    });
    api.seed({
      entity: 'moment',
      row: { ...b, text: 'Second, older', updatedAt: '2027-03-15T09:00:00Z' },
    });
    await syncNow(store, clock, api, documentary);

    expect((await moments.get(store.driver, a.id))?.text).toBe('First, edited');
    expect((await moments.get(store.driver, b.id))?.text).toBe('Second');
  });

  it('skips a pulled moment whose media is not on this phone, and lands a pulled cloud key', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    const shared = await captureMoment(store, clock, ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    await syncNow(store, clock, api, documentary);
    const local = await mediaAssets.get(store.driver, shared.mediaAssetId ?? '');
    const pushed = api.rows.get(`mediaAsset:${shared.mediaAssetId}`)!;
    api.seed({
      entity: 'mediaAsset',
      row: {
        ...(pushed.row as Extract<SyncChange, { entity: 'mediaAsset' }>['row']),
        cloudKey: 'u/x/preview',
      },
    });
    const elsewhere = {
      ...note(documentary, OTHER_ID, '2027-03-15T11:00:00Z', 'x'),
      kind: 'photo' as const,
      mediaAssetId: '00000000-0000-4000-8000-00000000ff02',
    };
    delete (elsewhere as { text?: string }).text;
    api.seed({ entity: 'moment', row: Moment.parse(elsewhere) });
    await syncNow(store, clock, api, documentary);

    expect(await moments.get(store.driver, OTHER_ID)).toBeUndefined();
    const after = await mediaAssets.get(store.driver, shared.mediaAssetId ?? '');
    expect(after).toEqual({ ...local, cloudKey: 'u/x/preview' });
  });

  it('keeps the cursor and the push mark after a failed push, and sends the same rows again', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    await syncNow(store, clock, api, documentary);
    const before = await syncState.read(store.driver);
    clock.set('2027-03-15T10:00:00Z');
    const moment = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'Late',
      localOnly: false,
    });

    api.failNext = true;
    expect(await syncNow(store, clock, api, documentary)).toEqual({ status: 'failed' });
    expect(await syncState.read(store.driver)).toEqual(before);

    const failed = requests(api.sent).at(-1)!;
    expect(await syncNow(store, clock, api, documentary)).toMatchObject({ status: 'synced' });
    expect(requests(api.sent).at(-1)!.changes).toEqual(failed.changes);
    expect(failed.changes.map((c) => c.row.id)).toContain(moment.id);
  });

  it('makes one round from two overlapping calls', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    await captureMoment(store, clock, ids, { kind: 'note', text: 'Once', localOnly: false });
    const [first, second] = await Promise.all([
      syncNow(store, clock, api, documentary),
      syncNow(store, clock, api, documentary),
    ]);
    expect(second).toBe(first);
    expect(api.sent).toHaveLength(1);
  });

  it('pages a large push by 100 and pulls until nothing is new', async () => {
    const { store, clock, documentary } = await setup();
    const api = fakeSyncApi({ page: 2 });
    for (let i = 0; i < 120; i += 1) {
      const id = `00000000-0000-4000-8000-${(0x1000 + i).toString(16).padStart(12, '0')}`;
      await moments.put(store.driver, note(documentary, id, '2027-03-15T09:00:00Z', `n${i}`));
    }
    for (let i = 0; i < 5; i += 1) {
      const id = `00000000-0000-4000-8000-${(0x2000 + i).toString(16).padStart(12, '0')}`;
      api.seed({ entity: 'moment', row: note(documentary, id, '2027-03-15T09:00:00Z', `p${i}`) });
    }
    const outcome = await syncNow(store, clock, api, documentary);
    // The documentary and 120 moments, then empty requests until the server has nothing newer (its
    // pages of 2 also bring back the first page's rows, which change nothing here).
    const sizes = requests(api.sent).map((r) => r.changes.length);
    expect(sizes.slice(0, 2)).toEqual([100, 21]);
    expect(sizes.slice(2).every((n) => n === 0)).toBe(true);
    expect(requests(api.sent).at(-1)?.cursor).toBe(126);
    expect(outcome).toMatchObject({ status: 'synced', pulled: 5 });
  });

  it('continues from the stored cursor after a restart', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    await captureMoment(store, clock, ids, { kind: 'note', text: 'Before', localOnly: false });
    await syncNow(store, clock, api, documentary);
    const { cursor } = await syncState.read(store.driver);
    expect(cursor).not.toBeNull();

    // A new Api (the app restarted) on the same store.
    const restarted = fakeSyncApi();
    for (const change of api.rows.values()) restarted.seed(change);
    await syncNow(store, clock, restarted, documentary);
    expect(requests(restarted.sent)[0]?.cursor).toBe(cursor);
  });

  it('syncs after a restart once the account reads its session', async () => {
    const { store, clock, ids, documentary, api } = await setup();
    const moment = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'After a restart',
      localOnly: false,
    });
    // As the Better Auth adapter: the cookie cache fills only when the session is read.
    let cookie: string | null = null;
    const account = {
      cookie: () => cookie,
      session: async () => {
        cookie = 'better-auth.session_token=tok';
        return { userId: ACCOUNT_ID, email: 'sam@example.com' };
      },
    } as unknown as Parameters<typeof syncIfSignedIn>[2];
    api.seed({ entity: 'storyline', row: storylineRow(documentary) });

    const outcome = await syncIfSignedIn(store, clock, account, api, documentary);
    expect(outcome).toMatchObject({ status: 'synced', pulled: 1 });
    expect(pushedIds(api.sent)).toContain(`moment:${moment.id}`);
  });

  it('makes no call for a signed-out account whose session is empty too', async () => {
    const { store, clock, documentary, api } = await setup();
    const account = { cookie: () => null, session: async () => null } as unknown as Parameters<
      typeof syncIfSignedIn
    >[2];
    expect(await syncIfSignedIn(store, clock, account, api, documentary)).toBeNull();
    expect(api.sent).toHaveLength(0);
  });

  it('pushes a photo and an answer captured before sign-in under the account id', async () => {
    const { store, clock, ids, documentary } = await setup();
    const api = fakeSyncApi({ userId: ACCOUNT_ID });
    const refused: unknown[] = [];
    const sync = api.sync;
    api.sync = async (request) => {
      const response = await sync(request);
      refused.push(...response.refused);
      return response;
    };
    const shot = await captureMoment(store, clock, ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    store.io.files.set(
      SOURCE,
      new Uint8Array(2000).map((_, i) => i & 255),
    );
    const question = await todayQuestion(store, documentary, clock, ids);
    const answer = await captureMoment(store, clock, ids, {
      kind: 'answer',
      questionId: question.id,
      media: video,
      localOnly: false,
    });

    clock.set('2027-03-15T10:00:00Z');
    api.registerDevice = async (device) => device;
    api.linkDocumentary = async (d) => ({ documentary: { ...d, ownerUserId: ACCOUNT_ID } });
    const device = { platform: 'ios' as const, appVersion: '0.0.0', newId: () => ids.newId() };
    const link = await afterSignIn(store, clock, api, documentary, device);
    if (!link.ok) throw new Error('The link failed');
    await syncNow(store, clock, api, link.documentary);

    expect(refused).toEqual([]);
    for (const moment of [shot, answer]) {
      const pushed = api.rows.get(`moment:${moment.id}`);
      expect(pushed?.row).toMatchObject({ authorUserId: ACCOUNT_ID });
      const asset = api.rows.get(`mediaAsset:${moment.mediaAssetId}`);
      expect(asset?.row).toMatchObject({ ownerUserId: ACCOUNT_ID });
    }
  });

  it('does nothing when signed out', async () => {
    const { store, clock, documentary, api } = await setup();
    const account = { cookie: () => null } as unknown as Parameters<typeof syncIfSignedIn>[2];
    expect(await syncIfSignedIn(store, clock, account, api, documentary)).toBeNull();
    expect(api.sent).toHaveLength(0);
  });
});
