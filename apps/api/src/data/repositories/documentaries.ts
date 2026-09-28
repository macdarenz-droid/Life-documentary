// Documentaries on the server; rows are parsed with the contract on the way out.
import { Documentary, type Uuid } from '@life/contracts';
import { and, eq, isNull, notExists } from 'drizzle-orm';
import type { Db } from '../db';
import { deletionRequests, documentaries } from '../schema';

export async function get(db: Db, id: Uuid): Promise<Documentary | null> {
  const [row] = await db.select().from(documentaries).where(eq(documentaries.id, id)).limit(1);
  return row ? Documentary.parse(row) : null;
}

export async function listByOwner(db: Db, ownerUserId: Uuid): Promise<Documentary[]> {
  const rows = await db
    .select()
    .from(documentaries)
    .where(eq(documentaries.ownerUserId, ownerUserId))
    .orderBy(documentaries.createdAt);
  return rows.map((row) => Documentary.parse(row));
}

/** Stores a new documentary; the caller checks that the id is free. */
export async function insert(db: Db, documentary: Documentary): Promise<Documentary> {
  const parsed = Documentary.parse(documentary);
  await db.insert(documentaries).values(parsed);
  return parsed;
}

/**
 * Every documentary whose owner has not asked for their account to be deleted (P16): the ones the
 * weekly cron looks at.
 */
export async function listScheduled(db: Db): Promise<Documentary[]> {
  const rows = await db
    .select()
    .from(documentaries)
    .where(
      notExists(
        db
          .select({ userId: deletionRequests.userId })
          .from(deletionRequests)
          .where(
            and(
              eq(deletionRequests.userId, documentaries.ownerUserId),
              isNull(deletionRequests.cancelledAt),
            ),
          ),
      ),
    );
  return rows.map((row) => Documentary.parse(row));
}
