// Requests for the originals an episode's plan uses (P16, D42): one row per episode and asset, pulled by
// the phone. Each write adds a change-log row. A met row stays met; closing ends every open one and
// aborts the multipart original uploads still open for those assets. A re-cut (P17, D43) reopens rows
// whatever their state.
import { OriginalRequest, type Timestamp, type Uuid } from '@life/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { changeLog, episodes, originalRequests } from '../schema';
import * as changes from './changes';
import * as uploads from './uploads';

export type RequestedAsset = { documentaryId: Uuid; momentId: Uuid; assetId: Uuid };

const toRequest = (row: typeof originalRequests.$inferSelect): OriginalRequest =>
  OriginalRequest.parse(row);

function batch(db: Db, statements: BatchItem<'sqlite'>[]): Promise<unknown> {
  if (statements.length === 0) return Promise.resolve();
  return db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

function recordAll(db: Db, rows: OriginalRequest[], at: Timestamp): BatchItem<'sqlite'>[] {
  return rows.map((r) => changes.record(db, r.documentaryId, 'originalRequest', r.id, at));
}

export async function forEpisode(db: Db, episodeId: Uuid): Promise<OriginalRequest[]> {
  const rows = await db
    .select()
    .from(originalRequests)
    .where(eq(originalRequests.episodeId, episodeId));
  return rows.map(toRequest);
}

/** The open requests for this asset, across episodes. */
export async function openForAsset(db: Db, assetId: Uuid): Promise<OriginalRequest[]> {
  const rows = await db
    .select()
    .from(originalRequests)
    .where(and(eq(originalRequests.assetId, assetId), eq(originalRequests.state, 'open')));
  return rows.map(toRequest);
}

/**
 * Opens a request for each asset, keeping a row that is already met (and its id); a closed one opens
 * again. Returns the episode's rows for these assets.
 */
export async function open(
  db: Db,
  episodeId: Uuid,
  assets: RequestedAsset[],
  now: Timestamp,
): Promise<OriginalRequest[]> {
  if (assets.length === 0) return [];
  await batch(
    db,
    assets.map((a) =>
      db
        .insert(originalRequests)
        .values({
          id: crypto.randomUUID(),
          episodeId,
          ...a,
          state: 'open',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [originalRequests.episodeId, originalRequests.assetId],
          set: {
            state: sql`CASE WHEN ${originalRequests.state} = 'met' THEN 'met' ELSE 'open' END`,
            updatedAt: sql`CASE WHEN ${originalRequests.state} = 'closed' THEN ${now} ELSE ${originalRequests.updatedAt} END`,
          },
        }),
    ),
  );
  const rows = (
    await db
      .select()
      .from(originalRequests)
      .where(
        and(
          eq(originalRequests.episodeId, episodeId),
          inArray(
            originalRequests.assetId,
            assets.map((a) => a.assetId),
          ),
        ),
      )
  ).map(toRequest);
  await batch(db, recordAll(db, rows, now));
  return rows;
}

/**
 * Marks the asset's open requests met. Returns the episodes whose last open request this met, so the
 * run waiting for them can go on.
 */
export async function meet(db: Db, assetId: Uuid, now: Timestamp): Promise<Uuid[]> {
  const opened = await openForAsset(db, assetId);
  if (opened.length === 0) return [];
  const met = opened.map((r) => ({ ...r, state: 'met' as const, updatedAt: now }));
  await batch(db, [
    db
      .update(originalRequests)
      .set({ state: 'met', updatedAt: now })
      .where(
        inArray(
          originalRequests.id,
          met.map((r) => r.id),
        ),
      ),
    ...recordAll(db, met, now),
  ]);
  const done: Uuid[] = [];
  for (const episodeId of new Set(met.map((r) => r.episodeId))) {
    const left = await db
      .select({ id: originalRequests.id })
      .from(originalRequests)
      .where(and(eq(originalRequests.episodeId, episodeId), eq(originalRequests.state, 'open')))
      .limit(1);
    if (left.length === 0) done.push(episodeId);
  }
  return done;
}

/** Statements that close these open requests, with their change-log rows. */
export function closeStatements(
  db: Db,
  rows: OriginalRequest[],
  now: Timestamp,
): BatchItem<'sqlite'>[] {
  if (rows.length === 0) return [];
  return [
    db
      .update(originalRequests)
      .set({ state: 'closed', updatedAt: now })
      .where(
        inArray(
          originalRequests.id,
          rows.map((r) => r.id),
        ),
      ),
    ...recordAll(db, rows, now),
  ];
}

/**
 * Closes the episode's open requests and aborts the original uploads still open for those assets,
 * removing their upload rows. Returns the closed rows.
 */
export async function closeAll(
  db: Db,
  media: R2Bucket,
  episodeId: Uuid,
  now: Timestamp,
): Promise<OriginalRequest[]> {
  const opened = (await forEpisode(db, episodeId)).filter((r) => r.state === 'open');
  if (opened.length === 0) return [];
  const statements = closeStatements(db, opened, now);
  for (const request of opened) {
    const upload = await uploads.get(db, request.assetId, 'original');
    if (!upload) continue;
    await media.resumeMultipartUpload(upload.key, upload.uploadId).abort();
    statements.push(uploads.remove(db, request.assetId, 'original'));
  }
  await batch(db, statements);
  return opened.map((r) => ({ ...r, state: 'closed', updatedAt: now }));
}

/** The change-log rows of the episode's requests that match `where`, written by the batch itself. */
function recordWhere(db: Db, at: Timestamp, where: ReturnType<typeof and>): BatchItem<'sqlite'> {
  return db.insert(changeLog).select(
    db
      .select({
        // NULL takes the next `seq`.
        seq: sql<number>`NULL`.as('seq'),
        documentaryId: originalRequests.documentaryId,
        entity: sql<'originalRequest'>`'originalRequest'`.as('entity'),
        entityId: originalRequests.id,
        updatedAt: sql<string>`${at}`.as('updated_at'),
      })
      .from(originalRequests)
      .where(where),
  );
}

/** Batch items that set a request open for each asset, whatever its state, with its change-log row. */
export function reopenStatements(
  db: Db,
  episodeId: Uuid,
  rows: RequestedAsset[],
  now: Timestamp,
): BatchItem<'sqlite'>[] {
  return rows.flatMap((a) => [
    db
      .insert(originalRequests)
      .values({
        id: crypto.randomUUID(),
        episodeId,
        ...a,
        state: 'open',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [originalRequests.episodeId, originalRequests.assetId],
        set: { state: 'open', updatedAt: now },
      }),
    recordWhere(
      db,
      now,
      and(eq(originalRequests.episodeId, episodeId), eq(originalRequests.assetId, a.assetId)),
    ),
  ]);
}

/** Sets a request open for each asset, whatever its state (P17). */
export async function reopen(
  db: Db,
  episodeId: Uuid,
  rows: RequestedAsset[],
  now: Timestamp,
): Promise<void> {
  await batch(db, reopenStatements(db, episodeId, rows, now));
}

/**
 * Batch items that close the episode's open requests, with their change-log rows, only while the re-cut
 * run `runId` holds the episode's claim.
 */
export function closeAllWhileRun(
  db: Db,
  episodeId: Uuid,
  runId: string,
  now: Timestamp,
): BatchItem<'sqlite'>[] {
  const held = sql`EXISTS (SELECT 1 FROM ${episodes} WHERE ${episodes.id} = ${episodeId} AND ${episodes.recutRun} = ${runId})`;
  const where = and(
    eq(originalRequests.episodeId, episodeId),
    eq(originalRequests.state, 'open'),
    held,
  );
  return [
    recordWhere(db, now, where),
    db.update(originalRequests).set({ state: 'closed', updatedAt: now }).where(where),
  ];
}
