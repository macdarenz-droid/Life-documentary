// The web build is the Design Lab preview only: it has no device database. This stub keeps expo-sqlite's
// wasm worker out of the web bundle.
import type { SqlDriver } from './driver';

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  throw new Error(`The device database ${name} is not available in the web preview`);
}
