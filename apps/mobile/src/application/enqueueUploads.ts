// What a capture sends to the service (P6): `leavesDevice` decides for each moment. An answer goes up as
// recorded, so its job points at the asset's own file. A photo goes up as a preview (longest side
// 1,000 px, JPEG 0.8), made once and encrypted into the store like any file; the job records it as its
// source. Local-only moments, clips and notes get no job.
import { UploadJob, type MediaAsset, type Moment, type Timestamp } from '@life/contracts';
import { leavesDevice } from '@life/story';
import { encryptFile } from '../data/fileStore/fileStore';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as settings from '../data/repositories/settings';
import * as uploadJobs from '../data/repositories/uploadJobs';
import type { Poster, PosterMaker } from '../domain/capturePorts';
import { decryptToCache } from './playback';
import type { Clock, Store } from './ports';

/** A photo's preview: its longest side in pixels and its JPEG quality. */
export const PREVIEW_MAX_SIDE = 1000;
export const PREVIEW_QUALITY = 0.8;

/** The settings row that says captures from before the upload queue were enqueued. */
const ENQUEUED_EXISTING = 'uploads_enqueued_existing';

/** Which file of the moment may go up in P6 (no one has Cloud backup yet). */
export function uploadFor(moment: Moment, assetKind: MediaAsset['kind'] | undefined) {
  return leavesDevice({ ...moment, ...(assetKind ? { assetKind } : {}) }, { cloudBackup: false })
    .media;
}

function newJob(assetId: string, purpose: 'answer' | 'preview', now: Timestamp) {
  return UploadJob.parse({
    assetId,
    purpose,
    state: 'pending',
    parts: [],
    bytesDone: 0,
    attempts: 0,
    updatedAt: now,
  });
}

/** Writes the answer's job inside the capture's own transaction; nothing for any other moment. */
export async function enqueueAnswer(
  tx: Store['driver'],
  moment: Moment,
  asset: MediaAsset,
  now: Timestamp,
): Promise<void> {
  if (uploadFor(moment, asset.kind) !== 'answer') return;
  await uploadJobs.put(tx, newJob(asset.id, 'answer', now));
}

async function removeIfThere(store: Store, path: string | null | undefined) {
  if (path && (await store.io.exists(path))) await store.io.remove(path);
}

/** Makes the encrypted preview and its job; null when no preview could be made. */
async function enqueuePreview(
  store: Store,
  clock: Clock,
  posters: PosterMaker,
  asset: MediaAsset,
): Promise<UploadJob | null> {
  const previewPath = `${store.storeDir}/${asset.id}.preview.lde`;
  let source: string | null = null;
  let preview: Poster | null = null;
  let stored = false;
  try {
    source = await decryptToCache(store, {
      assetId: asset.id,
      sourcePath: asset.localPath,
      wrappedKey: asset.wrappedKey,
      dir: `${store.cacheDir}/uploads`,
      name: `${asset.id}.original`,
    });
    if (!source) return null;
    preview = await posters.fromPhoto(source, PREVIEW_MAX_SIDE, PREVIEW_QUALITY);
    if (!preview) return null;
    const sealed = await encryptFile({
      io: store.io,
      cipher: store.cipher,
      masterKey: store.masterKey,
      sourcePath: preview.uri,
      destPath: previewPath,
      assetId: asset.id,
    });
    const job = await uploadJobs.put(
      store.driver,
      UploadJob.parse({
        ...newJob(asset.id, 'preview', clock.now()),
        sourcePath: previewPath,
        sourceWrappedKey: sealed.wrappedKey,
      }),
    );
    stored = true;
    return job;
  } finally {
    await removeIfThere(store, source);
    await removeIfThere(store, preview?.uri);
    if (!stored) await removeIfThere(store, previewPath);
  }
}

/**
 * Enqueues what the moment may send, once: an existing job for the same asset and purpose is kept.
 * Returns the job, or null when nothing goes up.
 */
export async function enqueueUploads(
  store: Store,
  clock: Clock,
  posters: PosterMaker,
  momentId: string,
): Promise<UploadJob | null> {
  const moment = await moments.get(store.driver, momentId);
  if (!moment || moment.deletedAt || !moment.mediaAssetId) return null;
  const asset = await mediaAssets.get(store.driver, moment.mediaAssetId);
  if (!asset) return null;
  const purpose = uploadFor(moment, asset.kind);
  if (purpose !== 'answer' && purpose !== 'preview') return null;
  const existing = await uploadJobs.get(store.driver, asset.id, purpose);
  if (existing) return existing;
  if (purpose === 'answer') {
    return uploadJobs.put(store.driver, newJob(asset.id, 'answer', clock.now()));
  }
  return enqueuePreview(store, clock, posters, asset);
}

/** On the first run with the upload queue, enqueues every earlier capture by the same rule. */
export async function enqueueExisting(
  store: Store,
  clock: Clock,
  posters: PosterMaker,
): Promise<void> {
  if ((await settings.get(store.driver, ENQUEUED_EXISTING)) !== undefined) return;
  const rows = await store.driver.all<{ id: string }>(
    `SELECT id FROM moments WHERE media_asset_id IS NOT NULL AND deleted_at IS NULL
     ORDER BY captured_at, id`,
  );
  for (const { id } of rows) {
    await enqueueUploads(store, clock, posters, id).catch((error: unknown) => {
      console.error('An earlier capture was not enqueued.', error);
      return null;
    });
  }
  await settings.put(store.driver, ENQUEUED_EXISTING, clock.now());
}
