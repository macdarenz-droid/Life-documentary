// A Store, clock and ids for use-case tests: memory database, memory files, node crypto.
import { Uuid, type LocalDate, type Timestamp } from '@life/contracts';
import { localDay } from '@life/story';
import { memoryFileIO, type MemoryFileIO } from '../../data/fileStore/testing/memoryFileIO';
import { nodeCipher } from '../../data/fileStore/testing/nodeCipher';
import { migrate, migrations } from '../../data/migrations';
import { openMemoryDriver } from '../../data/sqlite/testing/memoryDriver';
import type { Clock, Ids, Store } from '../ports';

export async function memoryStore(): Promise<Store & { io: MemoryFileIO }> {
  const driver = await openMemoryDriver();
  await migrate(driver, '2027-01-01T00:00:00Z', migrations);
  return {
    driver,
    io: memoryFileIO(),
    cipher: nodeCipher,
    masterKey: new Uint8Array(32).fill(7),
    storeDir: 'store',
  };
}

export function fixedClock(at: Timestamp): Clock & { set(next: Timestamp): void } {
  let current = at;
  return {
    now: () => current,
    today: (timeZone: string): LocalDate => localDay(current, timeZone),
    set: (next) => {
      current = next;
    },
  };
}

export function sequentialIds(): Ids {
  let n = 0;
  return {
    newId: () => {
      n += 1;
      return Uuid.parse(`00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`);
    },
  };
}
