// A person's request to delete their account. Nothing is purged here: the DeleteJob (P21) acts on the
// open request once purge_after has passed.
import { Timestamp, Uuid } from '@life/contracts';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { deletionRequests } from '../schema';

export const PURGE_AFTER_DAYS = 30;

export const DeletionRequest = z.object({
  userId: Uuid,
  requestedAt: Timestamp,
  purgeAfter: Timestamp,
  cancelledAt: Timestamp.nullable(),
});
export type DeletionRequest = z.infer<typeof DeletionRequest>;

function daysLater(at: Timestamp, days: number): Timestamp {
  return new Date(Date.parse(at) + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function get(db: Db, userId: Uuid): Promise<DeletionRequest | null> {
  const [row] = await db
    .select()
    .from(deletionRequests)
    .where(eq(deletionRequests.userId, userId))
    .limit(1);
  return row ? DeletionRequest.parse(row) : null;
}

/** The open request for this person, if any. */
export async function open(db: Db, userId: Uuid): Promise<DeletionRequest | null> {
  const found = await get(db, userId);
  return found && found.cancelledAt === null ? found : null;
}

/** Opens a request (or keeps the one already open); a cancelled one starts again from `now`. */
export async function request(db: Db, userId: Uuid, now: Timestamp): Promise<DeletionRequest> {
  const already = await open(db, userId);
  if (already) return already;
  const next = DeletionRequest.parse({
    userId,
    requestedAt: now,
    purgeAfter: daysLater(now, PURGE_AFTER_DAYS),
    cancelledAt: null,
  });
  await db
    .insert(deletionRequests)
    .values(next)
    .onConflictDoUpdate({
      target: deletionRequests.userId,
      set: { requestedAt: next.requestedAt, purgeAfter: next.purgeAfter, cancelledAt: null },
    });
  return next;
}

/** Cancels the open request while it is still before purge_after; true when one was cancelled. */
export async function cancel(db: Db, userId: Uuid, now: Timestamp): Promise<boolean> {
  const found = await open(db, userId);
  if (!found || Date.parse(now) >= Date.parse(found.purgeAfter)) return false;
  await db
    .update(deletionRequests)
    .set({ cancelledAt: now })
    .where(eq(deletionRequests.userId, userId));
  return true;
}
