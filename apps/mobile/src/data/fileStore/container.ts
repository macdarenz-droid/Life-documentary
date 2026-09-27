// The container of a stored file, read from its first bytes, because the store keeps no extension.
// Anything not in the table is null: the file cannot be opened, and nothing guesses.
export type Container = 'mov' | 'mp4' | 'm4a' | 'heic' | 'jpg' | 'png';

/** How many head bytes `containerOf` needs. */
export const CONTAINER_HEAD_BYTES = 12;

const HEIC_BRANDS = new Set(['heic', 'heix', 'mif1', 'msf1']);

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

export function containerOf(head: Uint8Array): Container | null {
  if (head.length < CONTAINER_HEAD_BYTES) return null;
  if (ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (brand === 'qt  ') return 'mov';
    if (brand === 'M4A ') return 'm4a';
    if (HEIC_BRANDS.has(brand)) return 'heic';
    return 'mp4';
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  return null;
}
