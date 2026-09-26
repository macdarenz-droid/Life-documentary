// Shared mapping between contract objects (camelCase) and rows (snake_case). Every value written is
// parsed first; every row read is parsed before it is returned.
import type { SqlDriver, SqlValue } from '../sqlite/driver';
import { CorruptRowError } from './errors';

/** The part of a Zod schema the repositories use, so `data/` needs no direct zod import. */
export type Contract<T> = {
  parse(value: unknown): T;
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string } };
};

export type TableSpec<T> = {
  table: string;
  /** The primary-key field, also its column via `columns`. */
  key: keyof T & string;
  /** Stored scalar fields and their columns. */
  columns: Partial<Record<keyof T & string, string>>;
  /** Fields stored as INTEGER 0/1. */
  booleans?: readonly (keyof T & string)[];
  contract: Contract<T>;
};

export type Row = Record<string, SqlValue>;

function columnsOf<T>(spec: TableSpec<T>): [string, string][] {
  return Object.entries(spec.columns) as [string, string][];
}

export function toValues<T>(spec: TableSpec<T>, value: T): { cols: string[]; vals: SqlValue[] } {
  const record = value as Record<string, unknown>;
  const cols: string[] = [];
  const vals: SqlValue[] = [];
  for (const [field, column] of columnsOf(spec)) {
    const v = record[field];
    cols.push(column);
    if (v === undefined || v === null) vals.push(null);
    else if (typeof v === 'boolean') vals.push(v ? 1 : 0);
    else vals.push(v as SqlValue);
  }
  return { cols, vals };
}

/** Maps a row back to the contract shape (null → absent) and parses it; a failure is CorruptRowError. */
export function fromRow<T>(spec: TableSpec<T>, row: Row, extra: Record<string, unknown> = {}): T {
  const value: Record<string, unknown> = {};
  for (const [field, column] of columnsOf(spec)) {
    const v = row[column];
    if (v === null || v === undefined) continue;
    value[field] = spec.booleans?.includes(field as keyof T & string) ? v === 1 : v;
  }
  const parsed = spec.contract.safeParse({ ...value, ...extra });
  if (!parsed.success) {
    const keyColumn = spec.columns[spec.key] ?? spec.key;
    throw new CorruptRowError(spec.table, String(row[keyColumn]), parsed.error.message);
  }
  return parsed.data;
}

/**
 * Parses `value` with the contract (throwing its error) and inserts or replaces the row by key.
 * `derived` holds stored columns computed from the value, such as a moment's local day.
 */
export async function upsert<T>(
  driver: SqlDriver,
  spec: TableSpec<T>,
  value: T,
  derived: Record<string, SqlValue> = {},
): Promise<T> {
  const parsed = spec.contract.parse(value);
  const { cols, vals } = toValues(spec, parsed);
  for (const [column, v] of Object.entries(derived)) {
    cols.push(column);
    vals.push(v);
  }
  const keyColumn = spec.columns[spec.key] ?? spec.key;
  const updates = cols.filter((c) => c !== keyColumn).map((c) => `${c} = excluded.${c}`);
  await driver.run(
    `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (${keyColumn}) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
  return parsed;
}

export async function selectRow<T>(
  driver: SqlDriver,
  spec: TableSpec<T>,
  id: string,
): Promise<Row | undefined> {
  const keyColumn = spec.columns[spec.key] ?? spec.key;
  return driver.first<Row>(`SELECT * FROM ${spec.table} WHERE ${keyColumn} = ?`, [id]);
}
