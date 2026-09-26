// Streams originals into and out of the encrypted format, 1 MiB at a time, with a fresh key per file.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Cipher, FileIO } from '../../domain/ports';
import { concat, equalBytes, fromBase64, toBase64, uuidBytes } from './bytes';
import {
  CHUNK_SIZE,
  HEADER_BYTES,
  KEY_BYTES,
  NONCE_BYTES,
  TAG_BYTES,
  chunkAad,
  decodeHeader,
  encodeHeader,
  keyAad,
} from './format';

export class TamperedFileError extends Error {
  override name = 'TamperedFileError';
}

type EncryptInput = {
  io: FileIO;
  cipher: Cipher;
  masterKey: Uint8Array;
  sourcePath: string;
  destPath: string;
  assetId: string;
};

export async function encryptFile(
  input: EncryptInput,
): Promise<{ wrappedKey: string; sha256: string; bytes: number }> {
  const { io, cipher, masterKey, sourcePath, destPath, assetId } = input;
  const id = uuidBytes(assetId);
  const fileKey = cipher.randomBytes(KEY_BYTES);
  const keyNonce = cipher.randomBytes(NONCE_BYTES);
  const wrappedKey = toBase64(
    concat(keyNonce, await cipher.seal(masterKey, keyNonce, fileKey, keyAad(id))),
  );

  const bytes = await io.size(sourcePath);
  const chunks = Math.max(1, Math.ceil(bytes / CHUNK_SIZE));
  const hash = sha256.create();
  if (await io.exists(destPath)) await io.remove(destPath);
  await io.append(destPath, encodeHeader(assetId));
  for (let index = 0; index < chunks; index++) {
    const offset = index * CHUNK_SIZE;
    const plain = await io.read(sourcePath, offset, Math.min(CHUNK_SIZE, bytes - offset));
    hash.update(plain);
    const nonce = cipher.randomBytes(NONCE_BYTES);
    const sealed = await cipher.seal(
      fileKey,
      nonce,
      plain,
      chunkAad(id, index, index === chunks - 1),
    );
    await io.append(destPath, concat(nonce, sealed));
  }
  return { wrappedKey, sha256: bytesToHex(hash.digest()), bytes };
}

async function decryptInto(input: EncryptInput & { wrappedKey: string }): Promise<void> {
  const { io, cipher, masterKey, sourcePath, destPath, assetId, wrappedKey } = input;
  const id = uuidBytes(assetId);
  const total = await io.size(sourcePath);
  const header = decodeHeader(await io.read(sourcePath, 0, Math.min(HEADER_BYTES, total)));
  if (!header || header.chunkSize !== CHUNK_SIZE) throw new Error('Unknown header');
  if (!equalBytes(header.assetId, id)) throw new Error('The file belongs to another asset');

  const wrapped = fromBase64(wrappedKey);
  const fileKey = await cipher.open(
    masterKey,
    wrapped.slice(0, NONCE_BYTES),
    wrapped.slice(NONCE_BYTES),
    keyAad(id),
  );
  if (fileKey.length !== KEY_BYTES) throw new Error('The wrapped key is not a file key');

  const record = NONCE_BYTES + CHUNK_SIZE + TAG_BYTES;
  let offset = HEADER_BYTES;
  if (offset >= total) throw new Error('The final chunk is missing');
  for (let index = 0; offset < total; index++) {
    const length = Math.min(record, total - offset);
    if (length < NONCE_BYTES + TAG_BYTES) throw new Error('A chunk is too short');
    const chunk = await io.read(sourcePath, offset, length);
    const final = offset + length === total;
    const plain = await cipher.open(
      fileKey,
      chunk.slice(0, NONCE_BYTES),
      chunk.slice(NONCE_BYTES),
      chunkAad(id, index, final),
    );
    await io.append(destPath, plain);
    offset += length;
  }
}

/** Streams the original back out, checking every tag, the chunk order and the final chunk. */
export async function decryptFile(input: EncryptInput & { wrappedKey: string }): Promise<void> {
  const { io, destPath } = input;
  if (await io.exists(destPath)) await io.remove(destPath);
  try {
    await decryptInto(input);
  } catch (error) {
    if (await io.exists(destPath)) await io.remove(destPath);
    throw new TamperedFileError(error instanceof Error ? error.message : String(error));
  }
}
