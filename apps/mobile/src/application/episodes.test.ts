import { DeviceEpisode, Uuid } from '@life/contracts';
import * as episodes from '../data/repositories/episodes';
import type { Network } from '../domain/capturePorts';
import { openLocalDocumentary } from './bootstrap';
import { closeEpisode, downloadReady, openEpisode } from './episodes';
import { EPISODE_MP4, fakeEpisodeFiles } from './testing/fakeEpisodeFiles';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';

const T = '2027-03-21T17:00:00.000Z';
const wifi: Network = { connection: async () => 'wifi' };
const cellular: Network = { connection: async () => 'cellular' };

async function phone() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-21T18:00:00Z');
  const documentary = await openLocalDocumentary(store, clock, sequentialIds(), 'Europe/Berlin');
  const files = fakeEpisodeFiles(store.io);
  const put = async (n: number, patch: Partial<DeviceEpisode> = {}) => {
    const weekStart = new Date(Date.UTC(2027, 0, 3 + 7 * n)).toISOString().slice(0, 10);
    const weekEnd = new Date(Date.UTC(2027, 0, 9 + 7 * n)).toISOString().slice(0, 10);
    const row = DeviceEpisode.parse({
      id: Uuid.parse(`00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`),
      documentaryId: documentary.id,
      number: n,
      weekStart,
      weekEnd,
      state: 'ready',
      title: `Week ${n}`,
      durationMs: 90_000,
      renderVersion: 1,
      deliveredAt: T,
      updatedAt: T,
      ...patch,
    });
    await episodes.put(store.driver, row);
    return row;
  };
  /** Plain (unencrypted) episode files anywhere but the playback cache. */
  const plainOutsidePlayback = () =>
    [...store.io.files.keys()].filter(
      (k) => !k.startsWith('cache/playback/') && k.endsWith('.mp4'),
    );
  return { store, documentary, files, put, plainOutsidePlayback };
}

describe('downloadReady', () => {
  it('only runs on Wi-Fi', async () => {
    const p = await phone();
    await p.put(1);
    expect(await downloadReady(p.store, p.documentary, cellular, p.files)).toEqual({
      downloaded: 0,
      removed: 0,
    });
    expect(p.files.downloads).toEqual([]);
  });

  it('downloads the four newest of six ready episodes, and nothing on a second run', async () => {
    const p = await phone();
    for (let n = 1; n <= 6; n += 1) await p.put(n);
    await p.put(7, { state: 'rendering', renderVersion: 0, durationMs: undefined });

    const first = await downloadReady(p.store, p.documentary, wifi, p.files);
    expect(first.downloaded).toBe(4);
    expect(p.files.downloads.map((id) => id.slice(-2))).toEqual(['06', '05', '04', '03']);
    const saved = await episodes.listRecent(p.store.driver, p.documentary.id, 10);
    expect(saved.filter((e) => e.localPath !== undefined).map((e) => e.number)).toEqual([
      6, 5, 4, 3,
    ]);
    expect(p.plainOutsidePlayback()).toEqual([]);

    const second = await downloadReady(p.store, p.documentary, wifi, p.files);
    expect(second).toEqual({ downloaded: 0, removed: 0 });
    expect(p.files.downloads).toHaveLength(4);
  });

  it('replaces an older render version and deletes its copy', async () => {
    const p = await phone();
    const first = await p.put(1);
    await downloadReady(p.store, p.documentary, wifi, p.files);
    const oldPath = (await episodes.get(p.store.driver, first.id))!.localPath!;

    const stored = (await episodes.get(p.store.driver, first.id))!;
    await episodes.put(p.store.driver, { ...stored, renderVersion: 2, updatedAt: T });
    expect((await downloadReady(p.store, p.documentary, wifi, p.files)).downloaded).toBe(1);

    const after = (await episodes.get(p.store.driver, first.id))!;
    expect(after.localRenderVersion).toBe(2);
    expect(after.localPath).not.toBe(oldPath);
    expect(p.store.io.files.has(oldPath)).toBe(false);
    expect(p.store.io.files.has(after.localPath!)).toBe(true);
  });

  it('leaves no file after a failed download, and no plain episode file outside the playback cache', async () => {
    const p = await phone();
    const failing = await p.put(1);
    p.files.failing.add(failing.id);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await downloadReady(p.store, p.documentary, wifi, p.files)).downloaded).toBe(0);
    error.mockRestore();
    expect((await episodes.get(p.store.driver, failing.id))?.localPath).toBeUndefined();
    const left = [...p.store.io.files.keys()].filter((k) => k.includes(failing.id));
    expect(left).toEqual([]);
  });

  it('deletes copies that fell out of the four newest', async () => {
    const p = await phone();
    for (let n = 1; n <= 4; n += 1) await p.put(n);
    await downloadReady(p.store, p.documentary, wifi, p.files);
    const oldest = (await episodes.listRecent(p.store.driver, p.documentary.id, 10)).at(-1)!;
    expect(oldest.localPath).toBeDefined();

    await p.put(5);
    const run = await downloadReady(p.store, p.documentary, wifi, p.files);
    expect(run).toEqual({ downloaded: 1, removed: 1 });
    expect((await episodes.get(p.store.driver, oldest.id))?.localPath).toBeUndefined();
    expect(p.store.io.files.has(oldest.localPath!)).toBe(false);
  });
});

describe('openEpisode', () => {
  it('decrypts the local copy into the playback cache, and closing removes it', async () => {
    const p = await phone();
    const ep = await p.put(1);
    await downloadReady(p.store, p.documentary, wifi, p.files);
    const saved = (await episodes.get(p.store.driver, ep.id))!;

    const source = await openEpisode(p.store, p.files, saved);
    expect(source).toEqual({ uri: `cache/playback/episode-${ep.id}.mp4` });
    expect(p.store.io.files.get(source!.uri)).toEqual(EPISODE_MP4);
    await closeEpisode(p.store, ep.id);
    expect(p.store.io.files.has(source!.uri)).toBe(false);
  });

  it('streams the route with the session header without a local copy', async () => {
    const p = await phone();
    const ep = await p.put(1);
    expect(await openEpisode(p.store, p.files, ep)).toEqual({
      uri: `https://api.test/episodes/${ep.id}/video`,
      headers: { cookie: 'life.session_token=fake' },
    });
  });
});
