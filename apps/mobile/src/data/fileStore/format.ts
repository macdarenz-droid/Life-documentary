// Encrypted file format v1.
// Header (28 bytes): "LDE1" ‖ version 0x01 ‖ 3 zero bytes ‖ chunk size (uint32 BE) ‖ asset id (16 UUID bytes).
// Then chunks: nonce (12) ‖ ciphertext ‖ tag (16), each sealing up to CHUNK_SIZE bytes of plaintext; the
// last may be shorter and an empty file has one empty final chunk.
// AAD per chunk: asset id bytes ‖ chunk index (uint32 BE) ‖ final flag (1 byte).
import { concat, equalBytes, uint32BE, uuidBytes } from './bytes';

export const MAGIC = new Uint8Array([0x4c, 0x44, 0x45, 0x31]); // "LDE1"
export const FORMAT_VERSION = 1;
export const CHUNK_SIZE = 1_048_576;
export const HEADER_BYTES = 28;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
/** AAD prefix for the wrapped per-file key. */
export const KEY_AAD_MAGIC = new Uint8Array([0x4c, 0x44, 0x4b, 0x31]); // "LDK1"

export function encodeHeader(assetId: string, chunkSize = CHUNK_SIZE): Uint8Array {
  return concat(
    MAGIC,
    new Uint8Array([FORMAT_VERSION, 0, 0, 0]),
    uint32BE(chunkSize),
    uuidBytes(assetId),
  );
}

export type Header = { version: number; chunkSize: number; assetId: Uint8Array };

/** Parses a header; undefined when the bytes are not a v1 header. */
export function decodeHeader(bytes: Uint8Array): Header | undefined {
  if (bytes.length !== HEADER_BYTES || !equalBytes(bytes.slice(0, 4), MAGIC)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[4] ?? 0;
  if (version !== FORMAT_VERSION || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0)
    return undefined;
  return { version, chunkSize: view.getUint32(8, false), assetId: bytes.slice(12, 28) };
}

export function chunkAad(assetId: Uint8Array, index: number, final: boolean): Uint8Array {
  return concat(assetId, uint32BE(index), new Uint8Array([final ? 1 : 0]));
}

export function keyAad(assetId: Uint8Array): Uint8Array {
  return concat(KEY_AAD_MAGIC, assetId);
}
