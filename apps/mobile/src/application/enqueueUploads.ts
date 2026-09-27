// What a capture sends to the service (P6, P12): `leavesDevice` lists it for each moment. An answer goes
// up as recorded, so its job points at the asset's own file. A photo goes up as a preview and a video
// (a video answer or a library clip) also as a keyframe from its middle (longest side 1,000 px, JPEG 0.8),
// made once and encrypted into the store like any file; the job records it as its source. Local-only
// moments and notes get no job.
import {
  UploadJob,
  type MediaAsset,
  type Moment,
  type Timestamp,
  type UploadPurpose,
} from '@life/contracts';
import { leavesDevice } from '@life/story';
import { encryptFile } from '../data/fileStore/fileStore';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as settings from '../data/repositories/settings';
import * as uploadJobs from '../data/repositories/uploadJobs';
import type { Poster, PosterMaker } from '../domain/capturePorts';
import { decryptToCache } from './playback';
import type { Clock, Store } from './ports';

/** A photo's preview and a video's keyframe: the longest side in pixels and the JPEG quality. */
export const PREVIEW_MAX_SIDE = 1000;
export const PREVIEW_QUALITY = 0.8;

/**
 * The settings row that says earlier captures were enqueued by the current rule. It changed with the
 * keyframe (P12), so captures from before are enqueued once more; jobs that exist are kept.
 */
const ENQUEUED_EXISTING = 'uploads_enqueued_keyframes';

/** Working copies made on the phone before they go up. */
type MadePurpose = 'preview' | 'keyframe';

/** The purposes the moment's media may go up for (no one has Cloud backup yet). */
export function uploadsFor(
  moment: Moment,
  assetKind: MediaAsset['kind'] | undefined,
): UploadPurpose[] {
  return leavesDevice({ ...moment, ...(assetKind ? { assetKind } : {}) }, { cloudBackup: false })
    .uploads;
}

function newJob(assetId: string, purpose: UploadPurpose, now: Timestamp) {
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
  if (!uploadsFor(moment, asset.kind).includes('answer')) return;
  await uploadJobs.put(tx, newJob(asset.id, 'answer', now));
}

async function removeIfThere(store: Store, path: string | null | undefined) {
  if (path && (await store.io.exists(path))) await store.io.remove(path);
}

/**
 * Makes the encrypted working copy (a photo's preview or a video's keyframe) and its job; null when it
 * could not be made.
 */
async function enqueueMade(
  store: Store,
  clock: Clock,
  posters: PosterMaker,
  asset: MediaAsset,
  purpose: MadePurpose,
): Promise<UploadJob | null> {
  const previewPath = `${store.storeDir}/${asset.id}.${purpose}.lde`;
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
    preview =
      purpose === 'keyframe'
        ? await posters.fromVideo(
            source,
            Math.round((asset.durationMs ?? 0) / 2),
            PREVIEW_MAX_SIDE,
            PREVIEW_QUALITY,
          )
        : await posters.fromPhoto(source, PREVIEW_MAX_SIDE, PREVIEW_QUALITY);
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
        ...newJob(asset.id, purpose, clock.now()),
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
 * Enqueues what the moment may send, once per purpose: an existing job for the same asset and purpose
 * is kept. Returns the moment's jobs; a working copy that could not be made has none.
 */
export async function enqueueUploads(
  store: Store,
  clock: Clock,
  posters: PosterMaker,
  momentId: string,
): Promise<UploadJob[]> {
  const moment = await moments.get(store.driver, momentId);
  if (!moment || moment.deletedAt || !moment.mediaAssetId) return [];
  const asset = await mediaAssets.get(store.driver, moment.mediaAssetId);
  if (!asset) return [];
  const jobs: UploadJob[] = [];
  for (const purpose of uploadsFor(moment, asset.kind)) {
    const existing = await uploadJobs.get(store.driver, asset.id, purpose);
    if (existing) {
      jobs.push(existing);
    } else if (purpose === 'answer') {
      jobs.push(await uploadJobs.put(store.driver, newJob(asset.id, 'answer', clock.now())));
    } else if (purpose === 'preview' || purpose === 'keyframe') {
      const made = await enqueueMade(store, clock, posters, asset, purpose);
      if (made) jobs.push(made);
    }
  }
  return jobs;
}

/** On the first run with the current rule, enqueues every earlier capture by it. */
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
      return [];
    });
  }
  await settings.put(store.driver, ENQUEUED_EXISTING, clock.now());
}
