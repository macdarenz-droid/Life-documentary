// Sending what an episode asked for (P16, D42). Each open request whose asset is on this phone and whose
// moment `leavesDevice` lets go with `requested` gets an `original` job in the P6 queue. A photo goes up
// as a JPEG copy made in the foreground only (a full-size decode needs hundreds of MB, and re-encoding
// drops EXIF, location included); in the background it waits. A clip goes up as recorded and keeps the
// queue's Wi-Fi rule. A closed request takes its job and copy away, and gives up a started upload. One
// pass runs at a time per store, each copy has its own name, and a job is only added when none exists.
import { UploadJob, type MediaAsset, type OriginalRequest, type Timestamp } from '@life/contracts';
import { leavesDevice } from '@life/story';
import { encryptFile } from '../data/fileStore/fileStore';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as originalRequests from '../data/repositories/originalRequests';
import * as uploadJobs from '../data/repositories/uploadJobs';
import type { Api, Poster, PosterMaker } from '../domain/capturePorts';
import { decryptToCache } from './playback';
import type { Clock, Store } from './ports';

/** The JPEG quality of a photo's original copy; it keeps its full size. */
export const ORIGINAL_JPEG_QUALITY = 0.9;
const FULL_SIZE = Number.MAX_SAFE_INTEGER;
/** No one has Cloud backup until P23. */
const CLOUD_BACKUP = false;

export type QueueOptions = {
  /** In the foreground a photo is re-encoded; in the background it waits. */
  foreground: boolean;
  /** Makes the JPEG copy; without it a photo waits. */
  posters?: PosterMaker;
};

export type QueueOutcome = { queued: number; waiting: number; removed: number };

function newJob(assetId: string, now: Timestamp, source?: { path: string; wrappedKey: string }) {
  return UploadJob.parse({
    assetId,
    purpose: 'original',
    state: 'pending',
    parts: [],
    bytesDone: 0,
    attempts: 0,
    updatedAt: now,
    ...(source ? { sourcePath: source.path, sourceWrappedKey: source.wrappedKey } : {}),
  });
}

async function removeIfThere(store: Store, path: string | null | undefined) {
  if (path && (await store.io.exists(path))) await store.io.remove(path);
}

let copies = 0;

/** The photo as a full-size JPEG, encrypted into the store under its own name; null when it could not be made. */
async function jpegCopy(
  store: Store,
  clock: Clock,
  posters: PosterMaker,
  asset: MediaAsset,
): Promise<{ path: string; wrappedKey: string } | null> {
  copies += 1;
  const path = `${store.storeDir}/${asset.id}.original-${Date.parse(clock.now())}-${copies}.lde`;
  let source: string | null = null;
  let jpeg: Poster | null = null;
  let kept = false;
  try {
    source = await decryptToCache(store, {
      assetId: asset.id,
      sourcePath: asset.localPath,
      wrappedKey: asset.wrappedKey,
      dir: `${store.cacheDir}/uploads`,
      name: `${asset.id}.photo`,
    });
    if (!source) return null;
    jpeg = await posters.fromPhoto(source, FULL_SIZE, ORIGINAL_JPEG_QUALITY);
    if (!jpeg) return null;
    const sealed = await encryptFile({
      io: store.io,
      cipher: store.cipher,
      masterKey: store.masterKey,
      sourcePath: jpeg.uri,
      destPath: path,
      assetId: asset.id,
    });
    kept = true;
    return { path, wrappedKey: sealed.wrappedKey };
  } finally {
    await removeIfThere(store, source);
    await removeIfThere(store, jpeg?.uri);
    if (!kept) await removeIfThere(store, path);
  }
}

/** Enqueues the asset's original for an open request; what happened to it. */
async function queueOne(
  store: Store,
  clock: Clock,
  request: OriginalRequest,
  options: QueueOptions,
): Promise<'queued' | 'waiting' | 'skipped'> {
  const { driver } = store;
  const asset = await mediaAssets.get(driver, request.assetId);
  const moment = await moments.get(driver, request.momentId);
  if (!asset || !moment || moment.deletedAt !== undefined) return 'skipped';
  if (moment.mediaAssetId !== asset.id) return 'skipped';
  const allowed = leavesDevice(
    { ...moment, assetKind: asset.kind },
    { cloudBackup: CLOUD_BACKUP, requested: true },
  ).uploads.includes('original');
  if (!allowed) return 'skipped';
  if (asset.cloudKey || (await uploadJobs.get(driver, asset.id, 'original'))) return 'skipped';
  if (asset.kind === 'photo') {
    if (!options.foreground || !options.posters) return 'waiting';
    const copy = await jpegCopy(store, clock, options.posters, asset);
    if (!copy) return 'skipped';
    if (await uploadJobs.addIfAbsent(driver, newJob(asset.id, clock.now(), copy))) return 'queued';
    // Another pass queued it first: its copy stays and this one goes.
    await removeIfThere(store, copy.path);
    return 'skipped';
  }
  return (await uploadJobs.addIfAbsent(driver, newJob(asset.id, clock.now())))
    ? 'queued'
    : 'skipped';
}

/** Takes away the asset's original job and copy; a started upload is given up on the server too. */
async function dropOne(store: Store, api: Api, assetId: string): Promise<boolean> {
  const job = await uploadJobs.get(store.driver, assetId, 'original');
  if (!job) return false;
  if (job.uploadId !== undefined && job.state !== 'done') {
    await api.abortUpload(assetId, 'original').catch((error: unknown) => {
      // The server closed the upload with the request; this is only a courtesy.
      console.error('The started original upload was not given up.', error);
    });
  }
  await uploadJobs.remove(store.driver, assetId, 'original');
  await removeIfThere(store, job.sourcePath);
  return true;
}

const running = new WeakMap<Store, Promise<QueueOutcome>>();

/**
 * Runs after every sync and every background run: queues what open requests ask for, drops the rest.
 * A call while a pass runs gets that pass.
 */
export function queueRequestedOriginals(
  store: Store,
  clock: Clock,
  api: Api,
  options: QueueOptions,
): Promise<QueueOutcome> {
  const current = running.get(store);
  if (current) return current;
  const pass = queuePass(store, clock, api, options).finally(() => running.delete(store));
  running.set(store, pass);
  return pass;
}

async function queuePass(
  store: Store,
  clock: Clock,
  api: Api,
  options: QueueOptions,
): Promise<QueueOutcome> {
  const outcome: QueueOutcome = { queued: 0, waiting: 0, removed: 0 };
  const byAsset = new Map<string, OriginalRequest[]>();
  for (const request of await originalRequests.all(store.driver)) {
    byAsset.set(request.assetId, [...(byAsset.get(request.assetId) ?? []), request]);
  }
  for (const [assetId, requests] of byAsset) {
    const open = requests.find((r) => r.state === 'open');
    if (open) {
      try {
        const result = await queueOne(store, clock, open, options);
        if (result === 'queued') outcome.queued += 1;
        else if (result === 'waiting') outcome.waiting += 1;
      } catch (error) {
        console.error('A requested original was not queued.', error);
      }
    } else if (requests.some((r) => r.state === 'closed') && !CLOUD_BACKUP) {
      if (await dropOne(store, api, assetId)) outcome.removed += 1;
    }
  }
  return outcome;
}
