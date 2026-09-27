// The cost ledger (P12): one row per episode, step and unit, in micro-dollars. Recording the same step
// and unit again replaces its numbers and keeps the row's id, so a retried step is not counted twice.
import { CostLedgerRow, type Uuid } from '@life/contracts';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { costLedger } from '../schema';

export async function upsert(db: Db, input: Omit<CostLedgerRow, 'id'>): Promise<void> {
  const row = CostLedgerRow.parse({ ...input, id: crypto.randomUUID() });
  await db
    .insert(costLedger)
    .values(row)
    .onConflictDoUpdate({
      target: [costLedger.episodeId, costLedger.step, costLedger.unit],
      set: { provider: row.provider, units: row.units, microUsd: row.microUsd, at: row.at },
    });
}

export async function forEpisode(db: Db, episodeId: Uuid): Promise<CostLedgerRow[]> {
  const rows = await db
    .select()
    .from(costLedger)
    .where(eq(costLedger.episodeId, episodeId))
    .orderBy(costLedger.at, costLedger.step, costLedger.unit);
  return rows.map((r) => CostLedgerRow.parse(r));
}
