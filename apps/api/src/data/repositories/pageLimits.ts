// Request counts for the public deletion page, kept in Better Auth's rate_limit table under the page's
// own keys. The page calls Better Auth on the server, where Better Auth's own limiter does not run.
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { rateLimit } from '../schema';

/**
 * Counts one request against `key` and says whether it is within `limit` for the window. Like Better
 * Auth's limiter, the count starts again once `windowMs` has passed since the last counted request, and
 * a refused request is not counted.
 */
export async function take(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<boolean> {
  const [row] = await db.select().from(rateLimit).where(eq(rateLimit.key, key)).limit(1);
  if (!row) {
    await db.insert(rateLimit).values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now });
    return true;
  }
  const fresh = now - row.lastRequest > windowMs;
  if (!fresh && row.count >= limit) return false;
  await db
    .update(rateLimit)
    .set({ count: fresh ? 1 : row.count + 1, lastRequest: now })
    .where(eq(rateLimit.key, key));
  return true;
}
