// Device settings: one text value per key.
import type { SqlDriver } from '../sqlite/driver';

export async function get(driver: SqlDriver, key: string): Promise<string | undefined> {
  const row = await driver.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    key,
  ]);
  return row?.value;
}

export async function put(driver: SqlDriver, key: string, value: string): Promise<void> {
  await driver.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
