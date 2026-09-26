// AES-256-GCM over expo-crypto. Thin; verified on a device in P-B.
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytes,
} from 'expo-crypto';
import type { Cipher } from '../../domain/ports';

const TAG_BYTES = 16;

export const expoCipher: Cipher = {
  randomBytes: (length) => getRandomBytes(length),
  seal: async (key, nonce, plaintext, aad) => {
    const sealed = await aesEncryptAsync(plaintext, await AESEncryptionKey.import(key), {
      nonce: { bytes: nonce },
      tagLength: TAG_BYTES,
      additionalData: aad,
    });
    return sealed.ciphertext({ includeTag: true });
  },
  open: async (key, nonce, sealed, aad) =>
    aesDecryptAsync(
      AESSealedData.fromParts(nonce, sealed, TAG_BYTES),
      await AESEncryptionKey.import(key),
      {
        additionalData: aad,
      },
    ),
};
