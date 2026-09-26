// AES-256-GCM over node:crypto, in the same ciphertext ‖ tag layout as the Expo adapter.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Cipher } from '../../../domain/ports';

const TAG_BYTES = 16;

export const nodeCipher: Cipher = {
  randomBytes: (length) => new Uint8Array(randomBytes(length)),
  seal: async (key, nonce, plaintext, aad) => {
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return new Uint8Array(Buffer.concat([body, cipher.getAuthTag()]));
  },
  open: async (key, nonce, sealed, aad) => {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    const body = Buffer.concat([
      decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)),
      decipher.final(),
    ]);
    return new Uint8Array(body);
  },
};
