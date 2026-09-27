// Synced rows on the server (P6): reading them by id, turning them back into contract rows, and the
// upsert statement for one accepted change. D1 binds at most 100 parameters per statement, so reads by
// id go in chunks.
import {
  CastMember,
  Documentary,
  Moment,
  Question,
  Storyline,
  SyncedMediaAsset,
  type SyncChange,
  type SyncEntity,
  type Timestamp,
  type Uuid,
} from '@life/contracts';
import { eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { castMembers, documentaries, mediaAssets, moments, questions, storylines } from '../schema';

const ID_CHUNK = 90;

type Stored = {
  /** The documentary the row belongs to (for a documentary, its own id). */
  documentaryId: string;
  change: SyncChange;
};

/** Drops SQL nulls: the contracts use absent fields, not nulls. */
function present<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
}

function without<T extends Record<string, unknown>>(
  row: T,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_CHUNK) out.push(items.slice(i, i + ID_CHUNK));
  return out;
}

async function readRows(db: Db, entity: SyncEntity, ids: string[]): Promise<Stored[]> {
  const out: Stored[] = [];
  for (const part of chunks(ids)) {
    switch (entity) {
      case 'documentary':
        for (const r of await db
          .select()
          .from(documentaries)
          .where(inArray(documentaries.id, part)))
          out.push({ documentaryId: r.id, change: { entity, row: Documentary.parse(r) } });
        break;
      case 'moment':
        for (const r of await db.select().from(moments).where(inArray(moments.id, part)))
          out.push({
            documentaryId: r.documentaryId,
            change: { entity, row: Moment.parse(present(r)) },
          });
        break;
      case 'mediaAsset':
        for (const r of await db.select().from(mediaAssets).where(inArray(mediaAssets.id, part)))
          out.push({
            documentaryId: r.documentaryId,
            change: {
              entity,
              row: SyncedMediaAsset.parse(
                without(present(r), ['documentaryId', 'updatedAt', 'deletedAt']),
              ),
            },
          });
        break;
      case 'question':
        for (const r of await db.select().from(questions).where(inArray(questions.id, part)))
          out.push({
            documentaryId: r.documentaryId,
            change: {
              entity,
              row: Question.parse(without(present(r), ['updatedAt', 'deletedAt'])),
            },
          });
        break;
      case 'storyline':
        for (const r of await db.select().from(storylines).where(inArray(storylines.id, part)))
          out.push({
            documentaryId: r.documentaryId,
            change: { entity, row: Storyline.parse(present(r)) },
          });
        break;
      case 'castMember':
        for (const r of await db.select().from(castMembers).where(inArray(castMembers.id, part)))
          out.push({
            documentaryId: r.documentaryId,
            change: { entity, row: CastMember.parse(present(r)) },
          });
        break;
    }
  }
  return out;
}

/** The stored rows for these ids of one kind, keyed by id, whatever documentary they belong to. */
export async function getMany(
  db: Db,
  entity: SyncEntity,
  ids: string[],
): Promise<Map<string, Stored>> {
  const rows = await readRows(db, entity, [...new Set(ids)]);
  return new Map(rows.map((r) => [r.change.row.id, r]));
}

/**
 * The `updatedAt` last-write-wins compares. Media assets and questions have none in their contracts,
 * so for them the change log keeps the server's write time.
 */
export function changeTime(change: SyncChange, now: Timestamp): Timestamp {
  return change.entity === 'mediaAsset' || change.entity === 'question'
    ? now
    : change.row.updatedAt;
}

/** The statement that stores one accepted change for `documentaryId`. */
export function upsert(
  db: Db,
  documentaryId: Uuid,
  change: SyncChange,
  now: Timestamp,
): BatchItem<'sqlite'> {
  const n = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
  switch (change.entity) {
    case 'documentary': {
      const r = change.row;
      // The owner and the creation time stay as the server has them.
      return db
        .update(documentaries)
        .set({
          title: r.title,
          kind: r.kind,
          timeZone: r.timeZone,
          episodeDay: r.episodeDay,
          episodeHour: r.episodeHour,
          updatedAt: r.updatedAt,
        })
        .where(eq(documentaries.id, documentaryId));
    }
    case 'moment': {
      const r = change.row;
      const values = {
        id: r.id,
        documentaryId,
        authorUserId: r.authorUserId,
        capturedAt: r.capturedAt,
        timeZone: r.timeZone,
        kind: r.kind,
        questionId: n(r.questionId),
        mediaAssetId: n(r.mediaAssetId),
        text: n(r.text),
        mood: n(r.mood),
        placeName: n(r.placeName),
        localOnly: r.localOnly,
        storylineIds: r.storylineIds,
        castIds: r.castIds,
        updatedAt: r.updatedAt,
        deletedAt: n(r.deletedAt),
      };
      return db
        .insert(moments)
        .values(values)
        .onConflictDoUpdate({ target: moments.id, set: values });
    }
    case 'mediaAsset': {
      const r = change.row;
      const values = {
        id: r.id,
        documentaryId,
        ownerUserId: r.ownerUserId,
        kind: r.kind,
        durationMs: n(r.durationMs),
        width: n(r.width),
        height: n(r.height),
        bytes: r.bytes,
        sha256: r.sha256,
        cloudKey: n(r.cloudKey),
        createdAt: r.createdAt,
        updatedAt: now,
        deletedAt: null,
      };
      return db
        .insert(mediaAssets)
        .values(values)
        .onConflictDoUpdate({
          target: mediaAssets.id,
          // A phone that has not heard of the upload yet does not erase the cloud key.
          set: { ...values, cloudKey: sql`coalesce(excluded.cloud_key, ${mediaAssets.cloudKey})` },
        });
    }
    case 'question': {
      const r = change.row;
      const values = {
        id: r.id,
        documentaryId,
        templateId: r.templateId,
        reason: r.reason,
        askedOn: r.askedOn,
        storylineId: n(r.storylineId),
        text: r.text,
        answeredByMomentId: n(r.answeredByMomentId),
        updatedAt: now,
        deletedAt: null,
      };
      return db
        .insert(questions)
        .values(values)
        .onConflictDoUpdate({ target: questions.id, set: values });
    }
    case 'storyline': {
      const r = change.row;
      const values = {
        id: r.id,
        documentaryId,
        title: r.title,
        openedAt: r.openedAt,
        closedAt: n(r.closedAt),
        summary: n(r.summary),
        updatedAt: r.updatedAt,
        deletedAt: n(r.deletedAt),
      };
      return db
        .insert(storylines)
        .values(values)
        .onConflictDoUpdate({ target: storylines.id, set: values });
    }
    case 'castMember': {
      const r = change.row;
      const values = {
        id: r.id,
        documentaryId,
        name: r.name,
        relation: n(r.relation),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        deletedAt: n(r.deletedAt),
      };
      return db
        .insert(castMembers)
        .values(values)
        .onConflictDoUpdate({ target: castMembers.id, set: values });
    }
  }
}
