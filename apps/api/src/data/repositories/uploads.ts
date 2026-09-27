// Uploads on the server (P6, D34): the open multipart upload per asset and purpose, the asset and the
// moment an upload is for, and the write that gives a finished asset its cloud key.
import type { MediaAsset, Moment, Timestamp, UploadPurpose, Uuid } from '@life/contracts';
import { and, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { mediaAssets, moments, uploads } from '../schema';
import * as rows from './sync';

export type OpenUpload = typeof uploads.$inferSelect;

export async function get(
  db: Db,
  assetId: Uuid,
  purpose: UploadPurpose,
): Promise<OpenUpload | undefined> {
  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.assetId, assetId), eq(uploads.purpose, purpose)))
    .limit(1);
  return row;
}

export async function insert(db: Db, upload: OpenUpload): Promise<void> {
  await db.insert(uploads).values(upload);
}

export function remove(db: Db, assetId: Uuid, purpose: UploadPurpose): BatchItem<'sqlite'> {
  return db.delete(uploads).where(and(eq(uploads.assetId, assetId), eq(uploads.purpose, purpose)));
}

export type AssetForUpload = {
  documentaryId: Uuid;
  ownerUserId: Uuid;
  kind: MediaAsset['kind'];
  deleted: boolean;
  /** The live moment that shows the asset, when there is one. */
  moment: Moment | undefined;
};

/** A synced asset and its moment, or undefined when the server has no such asset. */
export async function assetForUpload(db: Db, assetId: Uuid): Promise<AssetForUpload | undefined> {
  const [asset] = await db
    .select({
      documentaryId: mediaAssets.documentaryId,
      ownerUserId: mediaAssets.ownerUserId,
      kind: mediaAssets.kind,
      deletedAt: mediaAssets.deletedAt,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!asset) return undefined;
  const found = await db
    .select({ id: moments.id })
    .from(moments)
    // Only moments of the asset's own documentary count; another person's moment cannot name it.
    .where(and(eq(moments.documentaryId, asset.documentaryId), eq(moments.mediaAssetId, assetId)));
  const stored = await rows.getMany(
    db,
    'moment',
    found.map((m) => m.id),
  );
  const live = [...stored.values()]
    .map((s) => s.change.row as Moment)
    .find((m) => m.deletedAt === undefined);
  return {
    documentaryId: asset.documentaryId as Uuid,
    ownerUserId: asset.ownerUserId as Uuid,
    kind: asset.kind,
    deleted: asset.deletedAt !== null,
    moment: live,
  };
}

/** The statement that records a finished upload's cloud key on its asset. */
export function setCloudKey(
  db: Db,
  assetId: Uuid,
  cloudKey: string,
  now: Timestamp,
): BatchItem<'sqlite'> {
  return db
    .update(mediaAssets)
    .set({ cloudKey, updatedAt: now })
    .where(eq(mediaAssets.id, assetId));
}
