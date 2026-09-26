import { toBase64 } from './bytes';
import { MASTER_KEY_NAME, MasterKeyError, loadOrCreateMasterKey } from './masterKey';
import { memoryKeyStore } from './testing/memoryKeyStore';
import { nodeCipher } from './testing/nodeCipher';

describe('loadOrCreateMasterKey', () => {
  it('creates a 32-byte key once and returns the same key after', async () => {
    const store = memoryKeyStore();
    const first = await loadOrCreateMasterKey(store, nodeCipher);
    expect(first).toHaveLength(32);
    expect(store.values.has(MASTER_KEY_NAME)).toBe(true);
    expect(await loadOrCreateMasterKey(store, nodeCipher)).toEqual(first);
  });

  it('rejects a stored key of 31 bytes', async () => {
    const store = memoryKeyStore();
    await store.set(MASTER_KEY_NAME, toBase64(new Uint8Array(31)));
    await expect(loadOrCreateMasterKey(store, nodeCipher)).rejects.toBeInstanceOf(MasterKeyError);
  });
});
