// A documentary's week on the server (P12, D38): its moments by local day, the rule `weekBrief` uses
// (`localDay(capturedAt, timeZone)` from `weekStart` to `weekStart + 6`), not deleted, each with its
// media asset's kind, owner and duration when it has one. `leavesDevice` is the caller's to apply.
import type { LocalDate, MediaAsset, Moment, Uuid } from '@life/contracts';
import { addDays, localDay } from '@life/story';
import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { mediaAssets, moments } from '../schema';
import * as rows from './sync';

export type WeekAsset = Pick<MediaAsset, 'id' | 'kind' | 'ownerUserId' | 'durationMs'>;
export type WeekMoment = { moment: Moment; asset?: WeekAsset };

const ID_CHUNK = 90;

export async function momentsOfWeek(
  db: Db,
  documentaryId: Uuid,
  weekStart: LocalDate,
): Promise<WeekMoment[]> {
  const weekEnd = addDays(weekStart, 6);
  // Time zones are within a day of UTC, so a day either side holds every candidate.
  const found = await db
    .select({ id: moments.id })
    .from(moments)
    .where(
      and(
        eq(moments.documentaryId, documentaryId),
        isNull(moments.deletedAt),
        gte(moments.capturedAt, addDays(weekStart, -1)),
        lt(moments.capturedAt, addDays(weekEnd, 2)),
      ),
    );
  const stored = await rows.getMany(
    db,
    'moment',
    found.map((m) => m.id),
  );
  const week = [...stored.values()]
    .flatMap((s) => (s.change.entity === 'moment' ? [s.change.row] : []))
    .filter((m) => {
      const day = localDay(m.capturedAt, m.timeZone);
      return m.deletedAt === undefined && day >= weekStart && day <= weekEnd;
    })
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));

  const assetIds = [...new Set(week.flatMap((m) => (m.mediaAssetId ? [m.mediaAssetId] : [])))];
  const assets = new Map<string, WeekAsset>();
  for (let i = 0; i < assetIds.length; i += ID_CHUNK) {
    for (const a of await db
      .select({
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        ownerUserId: mediaAssets.ownerUserId,
        durationMs: mediaAssets.durationMs,
        documentaryId: mediaAssets.documentaryId,
      })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, assetIds.slice(i, i + ID_CHUNK)))) {
      // Only the documentary's own assets count.
      if (a.documentaryId !== documentaryId) continue;
      assets.set(a.id, {
        id: a.id as Uuid,
        kind: a.kind,
        ownerUserId: a.ownerUserId as Uuid,
        ...(a.durationMs !== null ? { durationMs: a.durationMs } : {}),
      });
    }
  }
  return week.map((moment) => {
    const asset = moment.mediaAssetId ? assets.get(moment.mediaAssetId) : undefined;
    return asset ? { moment, asset } : { moment };
  });
}

/** Whether the moment exists in the documentary and is not deleted: derived rows are written only then. */
export async function isLive(db: Db, documentaryId: Uuid, momentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: moments.id })
    .from(moments)
    .where(
      and(
        eq(moments.id, momentId),
        eq(moments.documentaryId, documentaryId),
        isNull(moments.deletedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}
