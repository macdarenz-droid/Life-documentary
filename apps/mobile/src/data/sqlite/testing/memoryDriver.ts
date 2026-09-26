// The Node adapter for tests: better-sqlite3 in memory, with the same pragmas as the device adapter.
import Database from 'better-sqlite3';
import type { SqlDriver, SqlValue } from '../driver';

export async function openMemoryDriver(): Promise<SqlDriver> {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const make = (inTransaction: boolean): SqlDriver => {
    const driver: SqlDriver = {
      exec: async (sql) => {
        db.exec(sql);
      },
      run: async (sql, params: SqlValue[] = []) => ({
        changes: db.prepare(sql).run(...params).changes,
      }),
      all: async <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
      first: async <T>(sql: string, params: SqlValue[] = []) =>
        db.prepare(sql).get(...params) as T | undefined,
      transaction: async <T>(fn: (tx: SqlDriver) => Promise<T>) => {
        if (inTransaction) return fn(driver);
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(make(true));
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      close: async () => {
        db.close();
      },
    };
    return driver;
  };
  return make(false);
}
