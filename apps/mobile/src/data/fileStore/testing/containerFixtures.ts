// File heads for container tests: an ftyp box with a brand, and the JPEG and PNG signatures.

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export const ftyp = (brand: string) =>
  new Uint8Array([0x00, 0x00, 0x00, 0x14, ...ascii('ftyp'), ...ascii(brand), 0, 0, 0, 0]);
export const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii('JFIF'), 0, 1]);
export const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

/** `head` followed by filler up to `length` bytes. */
export function fileWithHead(head: Uint8Array, length = 4096): Uint8Array {
  const bytes = new Uint8Array(length).map((_, i) => (i * 13 + 5) & 255);
  bytes.set(head, 0);
  return bytes;
}
