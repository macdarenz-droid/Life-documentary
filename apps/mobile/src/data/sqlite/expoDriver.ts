// The device adapter over expo-sqlite. Thin by design: behaviour is tested on the Node adapter and this
// one is verified on a device in P-B.
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { SqlDriver, SqlValue } from './driver';

function bound(db: SQLiteDatabase, inTransaction: boolean): SqlDriver {
  const driver: SqlDriver = {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    all: <T>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    first: async <T>(sql: string, params: SqlValue[] = []) =>
      (await db.getFirstAsync<T>(sql, params)) ?? undefined,
    transaction: async <T>(fn: (tx: SqlDriver) => Promise<T>) => {
      if (inTransaction) return fn(driver);
      let result: T | undefined;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(bound(txn, true));
      });
      return result as T;
    },
    close: () => db.closeAsync(),
  };
  return driver;
}

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  const db = await openDatabaseAsync(name);
  // Outside any transaction: foreign_keys does nothing inside one, and the device default is off.
  await db.execAsync('PRAGMA foreign_keys = ON');
  await db.execAsync('PRAGMA journal_mode = WAL');
  return bound(db, false);
}
