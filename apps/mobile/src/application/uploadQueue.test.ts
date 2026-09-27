import { UPLOAD_PART_SIZE } from '@life/contracts';
import * as moments from '../data/repositories/moments';
import * as uploadJobs from '../data/repositories/uploadJobs';
import type { Network, PosterMaker } from '../domain/capturePorts';
import { openLocalDocumentary } from './bootstrap';
import { captureMoment, type MediaInput } from './captureMoment';
import { deleteMoment } from './footage';
import { enqueueExisting, enqueueUploads, PREVIEW_MAX_SIDE } from './enqueueUploads';
import { fakeUploadApi } from './testing/fakeUploadApi';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { todayQuestion } from './todayQuestion';
import { backoffMs, drainUploads, MAX_ATTEMPTS } from './uploadQueue';

const SOURCE = 'tmp/source';
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
/** A JPEG-looking original, so the preview maker gets a file it can open. */
function original(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = (i * 7) & 255;
  bytes.set(JPEG);
  return bytes;
}
/** Byte-for-byte equality without a deep compare of millions of elements. */
const same = (a: Uint8Array | undefined, b: Uint8Array) =>
  a !== undefined && Buffer.from(a).equals(Buffer.from(b));
const previewBytes = new Uint8Array(1500).map((_, i) => JPEG[i] ?? (i * 3) & 255);

const video = (durationMs = 9000): MediaInput => ({
  sourcePath: SOURCE,
  mediaKind: 'video',
  durationMs,
  width: 1080,
  height: 1920,
});
const photo: MediaInput = { sourcePath: SOURCE, mediaKind: 'photo', width: 4032, height: 3024 };

async function setup(sourceBytes = original(4000)) {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  store.io.files.set(SOURCE, sourceBytes);
  const asked: { maxSide: number; quality: number | undefined }[] = [];
  /** Frames asked of videos; a frame is made only when `frames.make` is set. */
  const frames = {
    make: false,
    asked: [] as { atMs: number; maxSide: number; quality: number | undefined }[],
  };
  const posters: PosterMaker = {
    fromVideo: async (_uri, atMs, maxSide, quality) => {
      frames.asked.push({ atMs, maxSide, quality });
      if (!frames.make) return null;
      store.io.files.set('tmp/frame.jpg', previewBytes);
      return { uri: 'tmp/frame.jpg', width: 563, height: 1000 };
    },
    fromPhoto: async (_uri, maxSide, quality) => {
      asked.push({ maxSide, quality });
      store.io.files.set('tmp/preview.jpg', previewBytes);
      return { uri: 'tmp/preview.jpg', width: 1000, height: 750 };
    },
  };
  const network: Network & { kind: 'wifi' | 'cellular' | 'none' } = {
    kind: 'wifi',
    connection: async () => network.kind,
  };
  const api = fakeUploadApi();
  const drain = (options = {}) => drainUploads(store, clock, api, network, options);
  const answer = async (media = video(), localOnly = false) => {
    const question = await todayQuestion(store, documentary, clock, ids);
    const moment = await captureMoment(store, clock, ids, {
      kind: 'answer',
      questionId: question.id,
      media,
      localOnly,
    });
    await enqueueUploads(store, clock, posters, moment.id);
    return moment;
  };
  const plainCopies = () => [...store.io.files.keys()].filter((p) => p.startsWith('cache/'));
  return { store, clock, ids, posters, asked, frames, network, api, drain, answer, plainCopies };
}

describe('enqueueUploads and drainUploads', () => {
  it('holds a video answer on cellular and sends it on Wi-Fi', async () => {
    const t = await setup();
    const moment = await t.answer();
    t.network.kind = 'cellular';
    expect(await t.drain()).toEqual({ uploaded: 0, failed: 0, waiting: 1 });
    expect(t.api.calls).toEqual([]);

    t.network.kind = 'wifi';
    expect(await t.drain()).toMatchObject({ uploaded: 1 });
    expect(t.api.calls).toEqual(['create:answer', 'part:1', 'complete:answer']);
    expect(t.api.objects.get(`${moment.mediaAssetId}/answer`)).toEqual(original(4000));
    expect(await uploadJobs.get(t.store.driver, moment.mediaAssetId!, 'answer')).toMatchObject({
      state: 'done',
    });
  });

  it('sends a voice answer on cellular', async () => {
    const t = await setup();
    await t.answer({ sourcePath: SOURCE, mediaKind: 'audio', durationMs: 9000 });
    t.network.kind = 'cellular';
    expect(await t.drain()).toMatchObject({ uploaded: 1, waiting: 0 });
  });

  it('sends a photo as a preview of at most 1,000 px and never the original', async () => {
    const t = await setup();
    const moment = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    const jobs = await enqueueUploads(t.store, t.clock, t.posters, moment.id);
    expect(jobs).toMatchObject([{ purpose: 'preview', state: 'pending' }]);
    const job = jobs[0];
    expect(t.asked).toEqual([{ maxSide: PREVIEW_MAX_SIDE, quality: 0.8 }]);
    expect(PREVIEW_MAX_SIDE).toBe(1000);

    t.network.kind = 'cellular';
    expect(await t.drain()).toMatchObject({ uploaded: 1 });
    expect(t.api.calls).toEqual(['create:preview', 'part:1', 'complete:preview']);
    expect(t.api.objects.get(`${moment.mediaAssetId}/preview`)).toEqual(previewBytes);
    expect(t.api.contentTypes.get(`${moment.mediaAssetId}/preview`)).toBe('image/jpeg');
    expect([...t.api.objects.keys()].some((k) => k.endsWith('/original'))).toBe(false);
    // The encrypted preview is not kept once the service has it.
    expect(job?.sourcePath && t.store.io.files.has(job.sourcePath)).toBe(false);
  });

  it('enqueues only a keyframe for a library clip', async () => {
    const t = await setup();
    t.frames.make = true;
    const moment = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'clip',
      media: video(),
      localOnly: false,
    });
    const jobs = await enqueueUploads(t.store, t.clock, t.posters, moment.id);
    expect(jobs).toMatchObject([{ purpose: 'keyframe', state: 'pending' }]);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toMatchObject([
      { purpose: 'keyframe' },
    ]);
  });

  it('enqueues the answer and a keyframe from the middle of a video answer', async () => {
    const t = await setup();
    t.frames.make = true;
    const moment = await t.answer(video(9000));
    const jobs = await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!);
    expect(jobs.map((j) => j.purpose).sort()).toEqual(['answer', 'keyframe']);
    expect(t.frames.asked).toEqual([{ atMs: 4500, maxSide: 1000, quality: 0.8 }]);

    expect(await t.drain()).toMatchObject({ uploaded: 2 });
    expect(t.api.objects.get(`${moment.mediaAssetId}/keyframe`)).toEqual(previewBytes);
    expect(t.api.contentTypes.get(`${moment.mediaAssetId}/keyframe`)).toBe('image/jpeg');
    const keyframe = jobs.find((j) => j.purpose === 'keyframe');
    expect(keyframe?.sourcePath && t.store.io.files.has(keyframe.sourcePath)).toBe(false);
  });

  it('keeps the answer job when no frame can be made', async () => {
    const t = await setup();
    const moment = await t.answer();
    expect(t.frames.asked).toHaveLength(1);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toMatchObject([
      { purpose: 'answer' },
    ]);
  });

  it('enqueues nothing for a local-only capture and never calls the Api for it', async () => {
    const t = await setup();
    const moment = await t.answer(video(), true);
    t.store.io.files.set(SOURCE, original(4000));
    const shot = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'photo',
      media: photo,
      localOnly: true,
    });
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toEqual([]);
    expect(await enqueueUploads(t.store, t.clock, t.posters, shot.id)).toEqual([]);
    expect(t.asked).toEqual([]);
    expect(t.frames.asked).toEqual([]);
    await enqueueExisting(t.store, t.clock, t.posters);
    expect(await t.drain({ retryFailed: true })).toEqual({ uploaded: 0, failed: 0, waiting: 0 });
    expect(t.api.calls).toEqual([]);
  });

  it('resumes a drain that failed after part 2 of 3 with part 3 only', async () => {
    const size = 2 * UPLOAD_PART_SIZE + 1234;
    const t = await setup(original(size));
    const moment = await t.answer();
    t.api.failOnPart = 3;
    expect(await t.drain()).toMatchObject({ failed: 1 });
    expect(t.api.calls).toEqual(['create:answer', 'part:1', 'part:2', 'part:3']);
    const job = await uploadJobs.get(t.store.driver, moment.mediaAssetId!, 'answer');
    expect(job?.parts.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(job?.bytesDone).toBe(2 * UPLOAD_PART_SIZE);

    t.api.calls.length = 0;
    t.clock.set('2027-03-15T09:40:00Z');
    expect(await t.drain()).toMatchObject({ uploaded: 1 });
    expect(t.api.calls).toEqual(['create:answer', 'part:3', 'complete:answer']);
    expect(same(t.api.objects.get(`${moment.mediaAssetId}/answer`), original(size))).toBe(true);
  });

  it('waits 2, 4 and 8 minutes after 1, 2 and 3 failures', async () => {
    const t = await setup();
    const moment = await t.answer();
    t.api.down = true;
    const waits: number[] = [];
    let now = Date.parse('2027-03-15T09:30:00Z');
    for (let i = 0; i < 3; i += 1) {
      expect(await t.drain()).toMatchObject({ failed: 1 });
      const job = await uploadJobs.get(t.store.driver, moment.mediaAssetId!, 'answer');
      waits.push((Date.parse(job!.nextAttemptAt!) - now) / 60_000);
      // Not due yet: nothing is tried.
      expect(await t.drain()).toMatchObject({ failed: 0 });
      now = Date.parse(job!.nextAttemptAt!);
      t.clock.set(new Date(now).toISOString());
    }
    expect(waits).toEqual([2, 4, 8]);
    expect(backoffMs(20)).toBe(6 * 60 * 60_000);
  });

  it('marks a job failed after 8 failures and keeps it for the next foreground', async () => {
    const t = await setup();
    const moment = await t.answer();
    t.api.down = true;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await t.drain();
      const job = await uploadJobs.get(t.store.driver, moment.mediaAssetId!, 'answer');
      if (job?.nextAttemptAt) t.clock.set(job.nextAttemptAt);
    }
    const failed = await uploadJobs.get(t.store.driver, moment.mediaAssetId!, 'answer');
    expect(failed).toMatchObject({ state: 'failed', attempts: MAX_ATTEMPTS });

    t.api.down = false;
    t.api.calls.length = 0;
    expect(await t.drain()).toMatchObject({ uploaded: 0 });
    expect(t.api.calls).toEqual([]);
    expect(await t.drain({ retryFailed: true })).toMatchObject({ uploaded: 1 });
  });

  it('leaves no plain copy after a success or a failure', async () => {
    const t = await setup();
    await t.answer();
    t.api.failOnPart = 1;
    await t.drain();
    expect(t.plainCopies()).toEqual([]);
    t.clock.set('2027-03-15T10:00:00Z');
    expect(await t.drain()).toMatchObject({ uploaded: 1 });
    expect(t.plainCopies()).toEqual([]);
  });

  it('enqueues earlier captures once by the same rule', async () => {
    const t = await setup();
    const moment = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    await enqueueExisting(t.store, t.clock, t.posters);
    await enqueueExisting(t.store, t.clock, t.posters);
    expect(t.asked).toHaveLength(1);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toMatchObject([
      { purpose: 'preview' },
    ]);
  });

  it('enqueues a keyframe once for an earlier video capture', async () => {
    const t = await setup();
    t.frames.make = true;
    const moment = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'clip',
      media: video(),
      localOnly: false,
    });
    await enqueueExisting(t.store, t.clock, t.posters);
    await enqueueExisting(t.store, t.clock, t.posters);
    expect(t.frames.asked).toHaveLength(1);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toMatchObject([
      { purpose: 'keyframe' },
    ]);
  });

  it('stops sending when the moment is deleted between parts and leaves nothing behind', async () => {
    const t = await setup(original(2 * UPLOAD_PART_SIZE + 10));
    const moment = await t.answer();
    const send = t.api.uploadPart;
    t.api.uploadPart = async (assetId, purpose, n, bytes) => {
      const part = await send(assetId, purpose, n, bytes);
      if (n === 1) await deleteMoment(t.store, t.clock, moment.id);
      return part;
    };
    expect(await t.drain()).toEqual({ uploaded: 0, failed: 0, waiting: 0 });
    expect(t.api.calls).toEqual(['create:answer', 'part:1']);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toEqual([]);
    expect(t.plainCopies()).toEqual([]);
  });

  it('removes the job of a deleted moment without calling the Api', async () => {
    const t = await setup();
    const moment = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    const [job] = await enqueueUploads(t.store, t.clock, t.posters, moment.id);
    // As a tombstone pulled from another phone: the moment is deleted, its job is still here.
    await moments.softDelete(t.store.driver, moment.id, t.clock.now());
    expect(await t.drain()).toEqual({ uploaded: 0, failed: 0, waiting: 0 });
    expect(t.api.calls).toEqual([]);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toEqual([]);
    expect(t.store.io.files.has(job!.sourcePath!)).toBe(false);
  });

  it('removes a waiting preview with its job when the moment is deleted', async () => {
    const t = await setup();
    const moment = await captureMoment(t.store, t.clock, t.ids, {
      kind: 'photo',
      media: photo,
      localOnly: false,
    });
    const [job] = await enqueueUploads(t.store, t.clock, t.posters, moment.id);
    expect(t.store.io.files.has(job!.sourcePath!)).toBe(true);
    await deleteMoment(t.store, t.clock, moment.id);
    expect(t.store.io.files.has(job!.sourcePath!)).toBe(false);
    expect(await uploadJobs.listForAsset(t.store.driver, moment.mediaAssetId!)).toEqual([]);
  });
});
