import type { LocalDate, Timestamp, Uuid } from '@life/contracts';
import type { SqlDriver } from '../data/sqlite/driver';
import type { Cipher, FileIO } from '../domain/ports';

/** Time comes in, so use cases are testable. */
export type Clock = { now(): Timestamp; today(timeZone: string): LocalDate };
export type Ids = { newId(): Uuid };

/** Everything a use case needs to read and write the device store. */
export type Store = {
  driver: SqlDriver;
  io: FileIO;
  cipher: Cipher;
  masterKey: Uint8Array;
  storeDir: string;
  /** The app cache: plain playback copies and posters live here, cleared at every start (P10). */
  cacheDir: string;
};
