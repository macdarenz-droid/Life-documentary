// The upload queue on the phone (P6, D34). One drain at a time takes the due jobs oldest first and
// sends them one by one: video waits for Wi-Fi, the source is decrypted to the cache, the upload is
// created or resumed, only the parts not yet recorded go up (each etag recorded as it succeeds), then
// it completes. A failure waits min(2^attempts minutes, 6 hours); after 8 attempts the job is failed
// and kept, tried again only by a foreground drain. The plain copy never outlives the attempt. A job
// removed while it is sent (its moment was deleted) stops the send and is never written back. A 403 for
// an original (P16) is final: the request was closed or never there, so the job and its copy go.
import { UploadJob, type MediaAsset, type Timestamp } from '@life/contracts';
import { decryptFile } from '../data/fileStore/fileStore';
import { CONTAINER_HEAD_BYTES, containerOf, type Container } from '../data/fileStore/container';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as uploadJobs from '../data/repositories/uploadJobs';
import { ApiRefused, type Api, type Network } from '../domain/capturePorts';
import type { Clock, Store } from './ports';

/** After this many failed attempts a job is failed and waits for the next foreground. */
export const MAX_ATTEMPTS = 8;
const MINUTE_MS = 60_000;
const MAX_BACKOFF_MS = 6 * 60 * MINUTE_MS;
/** Due jobs read per drain. */
const DUE_LIMIT = 500;

/** The wait after the `attempts`-th failure. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * MINUTE_MS, MAX_BACKOFF_MS);
}

export type DrainOptions = {
  /** Stop starting new parts after this long (the background task's budget). */
  budgetMs?: number;
  /** Also try jobs that already failed 8 times (a foreground drain). */
  retryFailed?: boolean;
};

export type DrainOutcome = { uploaded: number; failed: number; waiting: number };

const CONTENT_TYPES: Record<Container, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4a: 'audio/mp4',
  heic: 'image/heic',
  jpg: 'image/jpeg',
  png: 'image/png',
};

const running = new WeakMap<Store, Promise<DrainOutcome>>();

/** One drain; a call while a drain runs gets that drain. */
export function drainUploads(
  store: Store,
  clock: Clock,
  api: Api,
  network: Network,
  options: DrainOptions = {},
): Promise<DrainOutcome> {
  const current = running.get(store);
  if (current) return current;
  const drain = runDrain(store, clock, api, network, options).finally(() => running.delete(store));
  running.set(store, drain);
  return drain;
}

async function removeIfThere(store: Store, path: string | undefined) {
  if (path && (await store.io.exists(path))) await store.io.remove(path);
}

const uploadsDir = (store: Store) => `${store.cacheDir}/uploads`;

/** Removes plain copies a killed run left behind; called at start, before any drain or enqueue. */
export async function clearUploadCache(store: Store): Promise<void> {
  for (const path of await store.io.list(uploadsDir(store))) await store.io.remove(path);
}

/** Thrown when the job row was removed while its file was being sent. */
class JobGone extends Error {}

async function runDrain(
  store: Store,
  clock: Clock,
  api: Api,
  network: Network,
  options: DrainOptions,
): Promise<DrainOutcome> {
  const outcome: DrainOutcome = { uploaded: 0, failed: 0, waiting: 0 };
  const started = Date.parse(clock.now());
  const outOfTime = () =>
    options.budgetMs !== undefined && Date.parse(clock.now()) - started >= options.budgetMs;

  await uploadJobs.resetInterrupted(store.driver);
  const connection = await network.connection();
  if (connection === 'none') return outcome;
  for (const job of await uploadJobs.listDue(store.driver, clock.now(), DUE_LIMIT)) {
    if (outOfTime()) break;
    if (job.state === 'failed' && !options.retryFailed) continue;
    const asset = await mediaAssets.get(store.driver, job.assetId);
    if (!asset) continue;
    // A deleted moment's job goes, with its working copy, and nothing is sent.
    if ((await moments.forMediaAsset(store.driver, asset.id))?.deletedAt) {
      await uploadJobs.remove(store.driver, job.assetId, job.purpose);
      await removeIfThere(store, job.sourcePath);
      continue;
    }
    if (asset.kind === 'video' && connection !== 'wifi') {
      outcome.waiting += 1;
      continue;
    }
    const result = await sendJob(store, clock, api, job, asset, outOfTime);
    if (result === 'done') outcome.uploaded += 1;
    else if (result === 'failed' || result === 'refused') outcome.failed += 1;
    else if (result === 'stopped') break;
  }
  return outcome;
}

/**
 * Sends one job: 'done', 'failed' (the wait is recorded), 'stopped' (out of time, nothing lost), 'gone'
 * (the job was removed meanwhile) or 'refused' (an original the server no longer takes; the job is gone).
 */
async function sendJob(
  store: Store,
  clock: Clock,
  api: Api,
  job: UploadJob,
  asset: MediaAsset,
  outOfTime: () => boolean,
): Promise<'done' | 'failed' | 'stopped' | 'gone' | 'refused'> {
  const { io } = store;
  const purpose = job.purpose ?? 'answer';
  const dir = uploadsDir(store);
  const plain = `${dir}/${job.assetId}.${purpose}.upload`;
  let current = job;
  // Each save first checks the row is still there, so a deleted moment's job never comes back.
  const save = async (next: UploadJob) => {
    const saved = await store.driver.transaction(async (tx) =>
      (await uploadJobs.get(tx, job.assetId, purpose))
        ? uploadJobs.put(tx, UploadJob.parse(next))
        : null,
    );
    if (!saved) throw new JobGone();
    current = saved;
  };
  try {
    await io.ensureDir(dir);
    await decryptFile({
      io,
      cipher: store.cipher,
      masterKey: store.masterKey,
      sourcePath: job.sourcePath ?? asset.localPath,
      destPath: plain,
      assetId: asset.id,
      wrappedKey: job.sourceWrappedKey ?? asset.wrappedKey,
    });
    const bytes = await io.size(plain);
    const container = containerOf(await io.read(plain, 0, Math.min(CONTAINER_HEAD_BYTES, bytes)));
    const contentType =
      purpose === 'preview' || purpose === 'keyframe'
        ? 'image/jpeg'
        : container
          ? CONTENT_TYPES[container]
          : 'application/octet-stream';
    const created = await api.createUpload({ assetId: asset.id, purpose, contentType, bytes });
    // The server gives back the open upload when there is one; a new id means start again.
    const parts = created.uploadId === job.uploadId ? job.parts : [];
    const length = (n: number) => Math.min(created.partSize, bytes - (n - 1) * created.partSize);
    await save({
      ...current,
      state: 'uploading',
      uploadId: created.uploadId,
      parts,
      bytesDone: parts.reduce((sum, p) => sum + length(p.partNumber), 0),
      updatedAt: clock.now(),
    });
    for (let n = 1; n <= created.partCount; n += 1) {
      if (current.parts.some((p) => p.partNumber === n)) continue;
      if (outOfTime()) {
        await save({ ...current, state: 'pending', updatedAt: clock.now() });
        return 'stopped';
      }
      const chunk = await io.read(plain, (n - 1) * created.partSize, length(n));
      const part = await api.uploadPart(asset.id, purpose, n, chunk);
      await save({
        ...current,
        parts: [...current.parts, part],
        bytesDone: current.bytesDone + chunk.byteLength,
        updatedAt: clock.now(),
      });
    }
    await save({ ...current, state: 'completing', updatedAt: clock.now() });
    const ordered = [...current.parts].sort((a, b) => a.partNumber - b.partNumber);
    await api.completeUpload(asset.id, purpose, ordered);
    // The service has it now: the encrypted working copy goes too.
    await save({
      ...current,
      state: 'done',
      nextAttemptAt: undefined,
      sourcePath: undefined,
      sourceWrappedKey: undefined,
      updatedAt: clock.now(),
    });
    await removeIfThere(store, job.sourcePath);
    return 'done';
  } catch (error) {
    if (error instanceof JobGone) return 'gone';
    if (purpose === 'original' && error instanceof ApiRefused && error.status === 403) {
      await uploadJobs.remove(store.driver, job.assetId, purpose);
      await removeIfThere(store, job.sourcePath);
      return 'refused';
    }
    console.error('An upload failed.', error);
    const attempts = current.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const now: Timestamp = clock.now();
    try {
      await save({
        ...current,
        state: failed ? 'failed' : 'pending',
        attempts,
        nextAttemptAt: failed
          ? undefined
          : new Date(Date.parse(now) + backoffMs(attempts)).toISOString(),
        updatedAt: now,
      });
    } catch (saveError) {
      if (saveError instanceof JobGone) return 'gone';
      throw saveError;
    }
    return 'failed';
  } finally {
    await removeIfThere(store, plain);
  }
}
