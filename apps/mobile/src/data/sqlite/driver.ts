/** A value SQLite stores and returns: text, number or null (booleans are 0/1). */
export type SqlValue = string | number | null;

/** The one port every repository talks to. Both adapters keep `PRAGMA foreign_keys = ON`. */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  /** Exclusive and all-or-nothing: a throw inside rolls everything back and is rethrown. */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
