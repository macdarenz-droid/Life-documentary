// Derived text on the phone (P12): the transcripts and captions the service made for this phone's
// moments, one row per moment and provider. They come only from a pull and never leave the phone.
import { Derived } from '@life/contracts';
import type { SqlDriver } from '../sqlite/driver';
import { fromRow, toValues, type Row, type TableSpec } from './table';

export const derivedSpec: TableSpec<Derived> = {
  table: 'derived',
  key: 'id',
  contract: Derived,
  columns: {
    id: 'id',
    momentId: 'moment_id',
    transcript: 'transcript',
    caption: 'caption',
    language: 'language',
    provider: 'provider',
    modelVersion: 'model_version',
    producedAt: 'produced_at',
  },
};

/**
 * Stores the row, replacing the one for the same moment and provider. The phone keeps no transcript
 * segments (their timings are for the service's captions), so they are dropped here.
 */
export async function put(driver: SqlDriver, row: Derived): Promise<Derived> {
  const parsed = Derived.parse(row);
  delete parsed.segments;
  const { cols, vals } = toValues(derivedSpec, parsed);
  const updates = cols
    .filter((c) => c !== 'moment_id' && c !== 'provider')
    .map((c) => `${c} = excluded.${c}`);
  await driver.run(
    `INSERT INTO derived (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (moment_id, provider) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
  return parsed;
}

/** The moment's rows, one per provider. */
export async function forMoment(driver: SqlDriver, momentId: string): Promise<Derived[]> {
  const rows = await driver.all<Row>(
    'SELECT * FROM derived WHERE moment_id = ? ORDER BY provider',
    [momentId],
  );
  return rows.map((row) => fromRow(derivedSpec, row));
}

export async function deleteForMoment(driver: SqlDriver, momentId: string): Promise<void> {
  await driver.run('DELETE FROM derived WHERE moment_id = ?', [momentId]);
}
