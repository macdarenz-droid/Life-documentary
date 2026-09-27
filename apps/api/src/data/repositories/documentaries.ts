// Documentaries on the server; rows are parsed with the contract on the way out.
import { Documentary, type Uuid } from '@life/contracts';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { documentaries } from '../schema';

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
