// The master key: 32 random bytes in the platform keychain, wrapping every per-file key.
import type { Cipher, KeyStore } from '../../domain/ports';
import { fromBase64, toBase64 } from './bytes';

export const MASTER_KEY_NAME = 'life.masterKey.v1';
const MASTER_KEY_BYTES = 32;

export class MasterKeyError extends Error {
  override name = 'MasterKeyError';
}

export async function loadOrCreateMasterKey(
  keyStore: KeyStore,
  cipher: Cipher,
): Promise<Uint8Array> {
  const stored = await keyStore.get(MASTER_KEY_NAME);
  if (stored !== null) {
    let key: Uint8Array;
    try {
      key = fromBase64(stored);
    } catch {
      throw new MasterKeyError('The stored master key is not base64');
    }
    if (key.length !== MASTER_KEY_BYTES) {
      throw new MasterKeyError(
        `The stored master key has ${key.length} bytes, not ${MASTER_KEY_BYTES}`,
      );
    }
    return key;
  }
  const key = cipher.randomBytes(MASTER_KEY_BYTES);
  await keyStore.set(MASTER_KEY_NAME, toBase64(key));
  return key;
}
