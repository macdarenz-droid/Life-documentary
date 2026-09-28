import { OriginalRequest, Uuid, type Moment } from '@life/contracts';
import { decryptFile } from '../data/fileStore/fileStore';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as originalRequests from '../data/repositories/originalRequests';
import * as uploadJobs from '../data/repositories/uploadJobs';
import type { PosterMaker } from '../domain/capturePorts';
import { openLocalDocumentary } from './bootstrap';
import { captureMoment } from './captureMoment';
import { ORIGINAL_JPEG_QUALITY, queueRequestedOriginals } from './originals';
import { syncNow } from './sync';
import { fakeSyncApi } from './testing/fakeSyncApi';
import { fakeUploadApi } from './testing/fakeUploadApi';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { drainUploads } from './uploadQueue';

const SOURCE = 'tmp/source.bin';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const MOV = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 9, 9]);
const EPISODE = Uuid.parse('00000000-0000-4000-8000-0000000000e1');
const T = '2027-03-21T06:00:00.000Z';
const LATER = '2027-03-21T17:50:00.000Z';

async function phone() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-21T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  const capture = async (kind: 'photo' | 'clip', localOnly = false): Promise<Moment> => {
    store.io.files.set(SOURCE, kind === 'photo' ? JPEG : MOV);
    return captureMoment(store, clock, ids, {
      kind,
      media:
        kind === 'photo'
          ? { sourcePath: SOURCE, mediaKind: 'photo', width: 8000, height: 6000 }
          : { sourcePath: SOURCE, mediaKind: 'video', durationMs: 9000, width: 1080, height: 1920 },
      localOnly,
    });
  };
  const encodes: { maxSide: number; quality: number | undefined }[] = [];
  const posters: PosterMaker = {
    fromVideo: async () => null,
    fromPhoto: async (_uri, maxSide, quality) => {
      encodes.push({ maxSide, quality });
      const uri = `${store.cacheDir}/jpeg-${encodes.length}.jpg`;
      store.io.files.set(uri, JPEG);
      return { uri, width: 8000, height: 6000 };
    },
  };
  let n = 0;
  const request = async (moment: Moment, state: OriginalRequest['state'] = 'open', at = T) => {
    n += 1;
    const row = OriginalRequest.parse({
      id: Uuid.parse(`00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`),
      episodeId: EPISODE,
      documentaryId: documentary.id,
      momentId: moment.id,
      assetId: moment.mediaAssetId,
      state,
      createdAt: T,
      updatedAt: at,
    });
    await originalRequests.put(store.driver, row);
    return row;
  };
  const api = fakeUploadApi();
  return { store, clock, ids, documentary, capture, posters, encodes, request, api };
}

const originalJob = (p: Awaited<ReturnType<typeof phone>>, moment: Moment) =>
  uploadJobs.get(p.store.driver, moment.mediaAssetId!, 'original');

describe('queueRequestedOriginals', () => {
  it('leaves one job whose copy decrypts when two calls overlap', async () => {
    const p = await phone();
    const photo = await p.capture('photo');
    await p.request(photo);

    // A second attempt that is slower and fails must not take the first one's copy with it.
    let calls = 0;
    const posters: PosterMaker = {
      ...p.posters,
      fromPhoto: async (uri, maxSide, quality) => {
        calls += 1;
        if (calls === 1) return p.posters.fromPhoto(uri, maxSide, quality);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return null;
      },
    };
    const options = { foreground: true, posters };
    await Promise.all([
      queueRequestedOriginals(p.store, p.clock, p.api, options),
      queueRequestedOriginals(p.store, p.clock, p.api, options),
    ]);

    const jobs = (await uploadJobs.listForAsset(p.store.driver, photo.mediaAssetId!)).filter(
      (j) => j.purpose === 'original',
    );
    expect(jobs).toHaveLength(1);
    // One pass at a time: the second call shares the first.
    expect(calls).toBe(1);
    const job = jobs[0]!;
    await decryptFile({
      io: p.store.io,
      cipher: p.store.cipher,
      masterKey: p.store.masterKey,
      sourcePath: job.sourcePath!,
      destPath: 'tmp/original.jpg',
      assetId: photo.mediaAssetId!,
      wrappedKey: job.sourceWrappedKey!,
    });
    expect(p.store.io.files.get('tmp/original.jpg')).toEqual(JPEG);
    const copies = [...p.store.io.files.keys()].filter((k) => k.includes('.original'));
    expect(copies).toEqual([job.sourcePath]);
  });

  it('enqueues a re-encoded photo and a clip in the foreground', async () => {
    const p = await phone();
    const photo = await p.capture('photo');
    const clip = await p.capture('clip');
    await p.request(photo);
    await p.request(clip);

    const outcome = await queueRequestedOriginals(p.store, p.clock, p.api, {
      foreground: true,
      posters: p.posters,
    });
    expect(outcome).toEqual({ queued: 2, waiting: 0, removed: 0 });
    expect(p.encodes).toEqual([
      { maxSide: Number.MAX_SAFE_INTEGER, quality: ORIGINAL_JPEG_QUALITY },
    ]);
    const photoJob = await originalJob(p, photo);
    expect(photoJob).toMatchObject({ purpose: 'original', state: 'pending' });
    expect(photoJob?.sourcePath).toBeDefined();
    expect(await p.store.io.exists(photoJob!.sourcePath!)).toBe(true);
    const clipJob = await originalJob(p, clip);
    expect(clipJob).toMatchObject({ purpose: 'original', state: 'pending' });
    expect(clipJob?.sourcePath).toBeUndefined();

    // The photo goes up as the JPEG copy, the clip as recorded.
    await drainUploads(p.store, p.clock, p.api, { connection: async () => 'wifi' });
    expect(p.api.objects.get(`${photo.mediaAssetId}/original`)).toEqual(JPEG);
    expect(p.api.contentTypes.get(`${photo.mediaAssetId}/original`)).toBe('image/jpeg');
    expect(p.api.objects.get(`${clip.mediaAssetId}/original`)).toEqual(MOV);
  });

  it('leaves a photo waiting in the background and queues it in the foreground', async () => {
    const p = await phone();
    const photo = await p.capture('photo');
    await p.request(photo);
    expect(
      await queueRequestedOriginals(p.store, p.clock, p.api, {
        foreground: false,
        posters: p.posters,
      }),
    ).toEqual({ queued: 0, waiting: 1, removed: 0 });
    expect(await originalJob(p, photo)).toBeUndefined();
    expect(p.encodes).toEqual([]);
    expect(
      (
        await queueRequestedOriginals(p.store, p.clock, p.api, {
          foreground: true,
          posters: p.posters,
        })
      ).queued,
    ).toBe(1);
  });

  it('skips a local-only moment and an asset already queued', async () => {
    const p = await phone();
    const kept = await p.capture('photo', true);
    const clip = await p.capture('clip');
    await p.request(kept);
    await p.request(clip);
    const options = { foreground: true, posters: p.posters };
    expect((await queueRequestedOriginals(p.store, p.clock, p.api, options)).queued).toBe(1);
    expect(await originalJob(p, kept)).toBeUndefined();
    expect((await queueRequestedOriginals(p.store, p.clock, p.api, options)).queued).toBe(0);
  });

  it('skips an asset whose original is already up', async () => {
    const p = await phone();
    const clip = await p.capture('clip');
    const asset = (await mediaAssets.get(p.store.driver, clip.mediaAssetId!))!;
    await mediaAssets.put(p.store.driver, { ...asset, cloudKey: 'u/x/y/z/original' });
    await p.request(clip);
    expect(
      (await queueRequestedOriginals(p.store, p.clock, p.api, { foreground: true })).queued,
    ).toBe(0);
  });

  it('takes away an unstarted job with its copy when the request closes', async () => {
    const p = await phone();
    const photo = await p.capture('photo');
    const open = await p.request(photo);
    await queueRequestedOriginals(p.store, p.clock, p.api, {
      foreground: true,
      posters: p.posters,
    });
    const copy = (await originalJob(p, photo))!.sourcePath!;

    await originalRequests.put(p.store.driver, { ...open, state: 'closed', updatedAt: LATER });
    expect(await queueRequestedOriginals(p.store, p.clock, p.api, { foreground: true })).toEqual({
      queued: 0,
      waiting: 0,
      removed: 1,
    });
    expect(await originalJob(p, photo)).toBeUndefined();
    expect(await p.store.io.exists(copy)).toBe(false);
    expect(p.api.calls).toEqual([]);
  });

  it('gives up a started upload with parts recorded when the request closes', async () => {
    const p = await phone();
    const clip = await p.capture('clip');
    const open = await p.request(clip);
    await queueRequestedOriginals(p.store, p.clock, p.api, { foreground: true });
    const job = (await originalJob(p, clip))!;
    await uploadJobs.put(p.store.driver, {
      ...job,
      uploadId: 'upload-9',
      parts: [{ partNumber: 1, etag: 'etag-1' }],
      bytesDone: 5,
    });

    await originalRequests.put(p.store.driver, { ...open, state: 'closed', updatedAt: LATER });
    expect(
      (await queueRequestedOriginals(p.store, p.clock, p.api, { foreground: true })).removed,
    ).toBe(1);
    expect(await originalJob(p, clip)).toBeUndefined();
    expect(p.api.calls).toEqual(['abort:original']);
  });
});

describe('uploading originals', () => {
  it('drops the job when the server refuses an original part with a 403', async () => {
    const p = await phone();
    const clip = await p.capture('clip');
    await p.request(clip);
    await queueRequestedOriginals(p.store, p.clock, p.api, { foreground: true });
    p.api.refused.add('original');
    const outcome = await drainUploads(p.store, p.clock, p.api, { connection: async () => 'wifi' });
    expect(outcome.failed).toBe(1);
    expect(await originalJob(p, clip)).toBeUndefined();
  });

  it("never sends a local-only moment's file", async () => {
    const p = await phone();
    const kept = await p.capture('photo', true);
    const clip = await p.capture('clip', true);
    await p.request(kept);
    await p.request(clip);
    await queueRequestedOriginals(p.store, p.clock, p.api, {
      foreground: true,
      posters: p.posters,
    });
    await drainUploads(p.store, p.clock, p.api, { connection: async () => 'wifi' });
    expect([...p.api.bodies.keys()]).toEqual([]);
    expect(p.api.calls).toEqual([]);
  });
});

describe('pulling requests', () => {
  it('lands a request for a moment on this phone, keeps a closed one closed, and skips the rest', async () => {
    const p = await phone();
    const clip = await p.capture('clip');
    const sync = fakeSyncApi();
    const row = (id: string, momentId: string, state: OriginalRequest['state'], at: string) =>
      OriginalRequest.parse({
        id,
        episodeId: EPISODE,
        documentaryId: p.documentary.id,
        momentId,
        assetId: Uuid.parse('00000000-0000-4000-8000-0000000002a1'),
        state,
        createdAt: T,
        updatedAt: at,
      });
    const mine = row('00000000-0000-4000-8000-0000000002b1', clip.id, 'open', T);
    const elsewhere = row(
      '00000000-0000-4000-8000-0000000002b2',
      '00000000-0000-4000-8000-0000000002c1',
      'open',
      T,
    );
    sync.seed({ entity: 'originalRequest', row: mine });
    sync.seed({ entity: 'originalRequest', row: elsewhere });
    await syncNow(p.store, p.clock, sync, p.documentary);
    expect(await originalRequests.all(p.store.driver)).toEqual([mine]);

    sync.seed({ entity: 'originalRequest', row: { ...mine, state: 'closed', updatedAt: LATER } });
    await syncNow(p.store, p.clock, sync, p.documentary);
    expect((await originalRequests.get(p.store.driver, mine.id))?.state).toBe('closed');
  });
});
