// Derived text on the server (P12, D38): one row per moment and provider. Deriving again replaces the
// text and keeps the row's id; each write adds a change-log row so phones pull it. Phones never push one.
import { Derived, type Uuid } from '@life/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { derived } from '../schema';
import * as changes from './changes';

const ID_CHUNK = 90;

/** A stored row as the contract has it (no documentary, no nulls), with its documentary. */
export function toDerived(row: typeof derived.$inferSelect): { documentaryId: Uuid; row: Derived } {
  const { documentaryId, ...rest } = row;
  return {
    documentaryId: documentaryId as Uuid,
    row: Derived.parse(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null))),
  };
}

/** Stores the text for the row's moment and provider, keeping an existing row's id; returns the row. */
export async function upsert(
  db: Db,
  documentaryId: Uuid,
  input: Omit<Derived, 'id'>,
): Promise<Derived> {
  const [existing] = await db
    .select({ id: derived.id })
    .from(derived)
    .where(and(eq(derived.momentId, input.momentId), eq(derived.provider, input.provider)))
    .limit(1);
  const id = existing?.id ?? crypto.randomUUID();
  const row = Derived.parse({ ...input, id });
  const values = {
    id: row.id,
    documentaryId,
    momentId: row.momentId,
    transcript: row.transcript ?? null,
    caption: row.caption ?? null,
    language: row.language,
    provider: row.provider,
    modelVersion: row.modelVersion,
    producedAt: row.producedAt,
  };
  // The id stays as stored; everything else is replaced.
  const replaced = { ...values, id: sql`${derived.id}` };
  await db.batch([
    db
      .insert(derived)
      .values(values)
      .onConflictDoUpdate({ target: [derived.momentId, derived.provider], set: replaced }),
    changes.record(db, documentaryId, 'derived', row.id, row.producedAt),
  ]);
  return row;
}

/** Every derived row of these moments. */
export async function forMoments(db: Db, momentIds: Uuid[]): Promise<Derived[]> {
  const out: Derived[] = [];
  const ids = [...new Set(momentIds)];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    for (const r of await db
      .select()
      .from(derived)
      .where(inArray(derived.momentId, ids.slice(i, i + ID_CHUNK))))
      out.push(toDerived(r).row);
  }
  return out;
}

/** The statement that removes a moment's derived rows (its tombstone was accepted). */
export function deleteForMoment(db: Db, momentId: Uuid): BatchItem<'sqlite'> {
  return db.delete(derived).where(eq(derived.momentId, momentId));
}
