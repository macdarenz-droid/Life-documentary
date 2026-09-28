// Uploads through the Worker (P6, D34): a phone starts a multipart upload for one of its assets, sends it
// in 5 MiB parts that stream into R2, then completes it. Every step checks that the asset belongs to the
// person's documentary and that `leavesDevice` lists this purpose for its moment (rule 8). An original is
// let in for an asset an episode asked for (P16); the last one an episode waited for wakes its run.
import {
  CompleteUpload,
  CreateUpload,
  CreateUploadResult,
  UPLOAD_PART_SIZE,
  UploadDone,
  UploadPurpose,
  UploadedPart,
  Uuid,
  partCountFor,
} from '@life/contracts';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { database, type Db } from '../data/db';
import { mediaKey } from '../data/mediaKeys';
import * as changes from '../data/repositories/changes';
import * as documentariesRepo from '../data/repositories/documentaries';
import * as episodesRepo from '../data/repositories/episodes';
import * as originalRequests from '../data/repositories/originalRequests';
import * as uploadsRepo from '../data/repositories/uploads';
import { ORIGINALS_READY_EVENT, episodeInstanceId } from '../pipeline/EpisodePipeline';
import { uploadsAllowed } from '../policy/leavesDevice';
import type { Env } from '../shared/env';
import { apiError } from '../shared/errors';
import { parseBody } from './body';
import { requireSession, type AppEnv } from './middleware/session';

/** A part's body may be at most this long; anything longer is refused before it is read. */
export const MAX_PART_BYTES = UPLOAD_PART_SIZE + 1024;

/** Whether the person may upload this asset for this purpose: it is theirs and may leave the phone. */
async function mayUpload(
  db: Db,
  userId: string,
  assetId: Uuid,
  purpose: UploadPurpose,
): Promise<{ documentaryId: Uuid } | null> {
  const asset = await uploadsRepo.assetForUpload(db, assetId);
  if (!asset || asset.deleted || !asset.moment) return null;
  const documentary = await documentariesRepo.get(db, asset.documentaryId);
  if (!documentary || documentary.ownerUserId !== userId || asset.ownerUserId !== userId) {
    return null;
  }
  const requested =
    purpose === 'original' && (await originalRequests.openForAsset(db, assetId)).length > 0;
  if (!uploadsAllowed(asset.moment, asset.kind, { requested }).includes(purpose)) return null;
  return { documentaryId: asset.documentaryId };
}

/** The Workflow event that tells a run every original it asked for has arrived (P16, D42). */
export const ORIGINALS_READY = ORIGINALS_READY_EVENT;

/**
 * Marks the asset's requests met and wakes each episode run that now has every original it asked for:
 * the weekly run and, while one holds the claim, the re-cut run (P17). Each is told separately and any
 * error is ignored: a run that no longer exists or has ended is left alone, and the cron recovers a claim.
 */
async function originalArrived(env: Env, db: Db, assetId: Uuid, now: string): Promise<void> {
  for (const episodeId of await originalRequests.meet(db, assetId, now)) {
    const episode = await episodesRepo.get(db, episodeId);
    if (!episode) continue;
    try {
      const instance = await env.EPISODE_PIPELINE.get(
        episodeInstanceId(episode.documentaryId, episode.weekStart),
      );
      await instance.sendEvent({ type: ORIGINALS_READY, payload: { episodeId } });
    } catch (error) {
      console.error('The episode run was not told its originals arrived.', error);
    }
    try {
      const run = (await episodesRepo.recutOf(db, episodeId))?.run;
      if (run) {
        const instance = await env.RECUT_PIPELINE.get(run);
        await instance.sendEvent({ type: ORIGINALS_READY, payload: { episodeId } });
      }
    } catch (error) {
      console.error('The re-cut run was not told its originals arrived.', error);
    }
  }
}

/** The open upload named by the path, when the person may still send it. */
async function openUpload(c: Context<AppEnv>) {
  const assetId = Uuid.safeParse(c.req.param('assetId'));
  const purpose = UploadPurpose.safeParse(c.req.param('purpose'));
  if (!assetId.success || !purpose.success) return { error: 404 as const };
  const db = database(c.env.DB);
  const upload = await uploadsRepo.get(db, assetId.data, purpose.data);
  if (!upload) return { error: 404 as const };
  if (!(await mayUpload(db, c.var.user.id, assetId.data, purpose.data))) {
    return { error: 403 as const };
  }
  return { db, upload, assetId: assetId.data, purpose: purpose.data };
}

function refuse(c: Context<AppEnv>, status: 403 | 404) {
  return status === 403
    ? apiError(c, 403, 'forbidden', 'This file cannot be uploaded.')
    : apiError(c, 404, 'not_found', 'There is no upload for this file.');
}

/** The exact length of part `n`: the part size, or what is left for the last one. */
function partLength(bytes: number, partCount: number, n: number): number {
  return n < partCount ? UPLOAD_PART_SIZE : bytes - (partCount - 1) * UPLOAD_PART_SIZE;
}

export const uploads = new Hono<AppEnv>()
  .post('/uploads', requireSession, async (c) => {
    const body = await parseBody(c, CreateUpload);
    if (!body) return apiError(c, 400, 'bad_request', 'The upload could not be read.');
    const db = database(c.env.DB);
    const userId = c.var.user.id;
    const allowed = await mayUpload(db, userId, body.assetId, body.purpose);
    if (!allowed) return refuse(c, 403);

    const partCount = partCountFor(body.bytes);
    const open = await uploadsRepo.get(db, body.assetId, body.purpose);
    if (open) {
      if (open.bytes !== body.bytes) {
        return apiError(c, 409, 'conflict', 'An upload of another size is already open.');
      }
      return c.json(
        CreateUploadResult.parse({
          uploadId: open.uploadId,
          partSize: UPLOAD_PART_SIZE,
          partCount: open.partCount,
        }),
        200,
      );
    }

    const key = mediaKey(userId, allowed.documentaryId, body.assetId, body.purpose);
    const multipart = await c.env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: body.contentType },
    });
    await uploadsRepo.insert(db, {
      assetId: body.assetId,
      purpose: body.purpose,
      documentaryId: allowed.documentaryId,
      uploadId: multipart.uploadId,
      key,
      bytes: body.bytes,
      partCount,
      createdAt: new Date().toISOString(),
    });
    return c.json(
      CreateUploadResult.parse({
        uploadId: multipart.uploadId,
        partSize: UPLOAD_PART_SIZE,
        partCount,
      }),
      200,
    );
  })
  .put('/uploads/:assetId/:purpose/parts/:n', requireSession, async (c) => {
    const found = await openUpload(c);
    if ('error' in found) return refuse(c, found.error);
    const { upload } = found;
    const n = Number(c.req.param('n'));
    if (!Number.isInteger(n) || n < 1 || n > upload.partCount) {
      return apiError(c, 400, 'bad_request', 'There is no such part.');
    }
    const expected = partLength(upload.bytes, upload.partCount, n);
    const declared = Number(c.req.header('content-length'));
    const body = c.req.raw.body;
    if (declared > MAX_PART_BYTES || declared !== expected || !body) {
      return apiError(c, 400, 'bad_request', `Part ${n} must be ${expected} bytes long.`);
    }
    // The body streams into R2; a body shorter or longer than it said fails the stream.
    const { readable, writable } = new FixedLengthStream(expected);
    const piping = body.pipeTo(writable).catch(() => undefined);
    try {
      const part = await c.env.MEDIA.resumeMultipartUpload(upload.key, upload.uploadId).uploadPart(
        n,
        readable,
      );
      await piping;
      return c.json(UploadedPart.parse({ partNumber: part.partNumber, etag: part.etag }), 200);
    } catch (error) {
      console.error('A part was not stored.', error);
      return apiError(c, 400, 'bad_request', `Part ${n} must be ${expected} bytes long.`);
    }
  })
  .post('/uploads/:assetId/:purpose/complete', requireSession, async (c) => {
    const found = await openUpload(c);
    if ('error' in found) return refuse(c, found.error);
    const { db, upload, assetId, purpose } = found;
    const body = await parseBody(c, CompleteUpload);
    if (!body) return apiError(c, 400, 'bad_request', 'The parts could not be read.');
    const numbers = body.parts.map((p) => p.partNumber).sort((a, b) => a - b);
    if (numbers.length !== upload.partCount || numbers.some((p, i) => p !== i + 1)) {
      return apiError(c, 400, 'bad_request', 'Some parts are missing.');
    }
    try {
      await c.env.MEDIA.resumeMultipartUpload(upload.key, upload.uploadId).complete(body.parts);
    } catch (error) {
      console.error('The upload did not complete.', error);
      return apiError(c, 400, 'bad_request', 'Some parts are missing.');
    }
    // Only an original is the asset's lasting copy; a working copy leaves the asset row alone and is
    // found later by its key.
    if (purpose === 'original') {
      const now = new Date().toISOString();
      await db.batch([
        uploadsRepo.setCloudKey(db, assetId, upload.key, now),
        changes.record(db, upload.documentaryId as Uuid, 'mediaAsset', assetId, now),
        uploadsRepo.remove(db, assetId, purpose),
      ]);
      await originalArrived(c.env, db, assetId, now);
    } else {
      await db.batch([uploadsRepo.remove(db, assetId, purpose)]);
    }
    return c.json(UploadDone.parse({ cloudKey: upload.key }), 200);
  })
  .delete('/uploads/:assetId/:purpose', requireSession, async (c) => {
    const assetId = Uuid.safeParse(c.req.param('assetId'));
    const purpose = UploadPurpose.safeParse(c.req.param('purpose'));
    if (!assetId.success || !purpose.success) return refuse(c, 404);
    const db = database(c.env.DB);
    const upload = await uploadsRepo.get(db, assetId.data, purpose.data);
    if (!upload) return refuse(c, 404);
    const documentary = await documentariesRepo.get(db, upload.documentaryId as Uuid);
    if (!documentary || documentary.ownerUserId !== c.var.user.id) return refuse(c, 403);
    await c.env.MEDIA.resumeMultipartUpload(upload.key, upload.uploadId).abort();
    await db.batch([uploadsRepo.remove(db, assetId.data, purpose.data)]);
    return c.body(null, 204);
  });
