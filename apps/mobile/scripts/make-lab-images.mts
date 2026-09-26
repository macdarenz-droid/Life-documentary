// Writes the two small gradient PNGs the Design Lab's Dissolve and Grain and Breath sections show.
// Colours come from the tokens; no downloaded media. Run: pnpm --filter @life/mobile lab:images
import { color } from '@life/design';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 64;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A SIZE × SIZE PNG fading top to bottom from one colour to another. */
function verticalGradient(topHex: string, bottomHex: string): Buffer {
  const top = rgb(topHex);
  const bottom = rgb(bottomHex);
  const rows: Buffer[] = [];
  for (let y = 0; y < SIZE; y++) {
    const t = y / (SIZE - 1);
    const row = Buffer.alloc(1 + SIZE * 3);
    const px = top.map((c, i) => Math.round(c + ((bottom[i] ?? c) - c) * t));
    for (let x = 0; x < SIZE; x++) row.set(px, 1 + x * 3);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../assets/lab/', import.meta.url);
writeFileSync(new URL('dusk.png', out), verticalGradient(color.theatreBlack, color.filmAmber));
writeFileSync(new URL('dawn.png', out), verticalGradient(color.velvet, color.projectorCyan));
