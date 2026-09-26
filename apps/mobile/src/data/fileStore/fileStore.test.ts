import { createHash } from 'node:crypto';
import { concat } from './bytes';
import { TamperedFileError, decryptFile, encryptFile } from './fileStore';
import { CHUNK_SIZE, HEADER_BYTES, NONCE_BYTES, TAG_BYTES, decodeHeader } from './format';
import { loadOrCreateMasterKey } from './masterKey';
import { memoryFileIO, type MemoryFileIO } from './testing/memoryFileIO';
import { memoryKeyStore } from './testing/memoryKeyStore';
import { nodeCipher } from './testing/nodeCipher';

const ASSET = '00000000-0000-4000-8000-00000000000a';
const OTHER = '00000000-0000-4000-8000-00000000000b';
const RECORD = NONCE_BYTES + CHUNK_SIZE + TAG_BYTES;

function generated(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + 7) & 255;
  return out;
}

async function setup(size: number) {
  const io = memoryFileIO();
  const masterKey = await loadOrCreateMasterKey(memoryKeyStore(), nodeCipher);
  io.files.set('in/source', generated(size));
  const result = await encryptFile({
    io,
    cipher: nodeCipher,
    masterKey,
    sourcePath: 'in/source',
    destPath: 'store/a.enc',
    assetId: ASSET,
  });
  const decrypt = (
    overrides: Partial<{ io: MemoryFileIO; masterKey: Uint8Array; assetId: string }> = {},
  ) =>
    decryptFile({
      io,
      cipher: nodeCipher,
      masterKey,
      sourcePath: 'store/a.enc',
      destPath: 'out/plain',
      assetId: ASSET,
      wrappedKey: result.wrappedKey,
      ...overrides,
    });
  return { io, masterKey, result, decrypt };
}

function chunksOf(file: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let o = HEADER_BYTES; o < file.length; o += RECORD)
    out.push(file.slice(o, Math.min(o + RECORD, file.length)));
  return out;
}

describe('encryptFile and decryptFile', () => {
  it.each([
    ['0 bytes', 0, 1],
    ['exactly 1 MiB', CHUNK_SIZE, 1],
    ['3.5 MiB', CHUNK_SIZE * 3.5, 4],
  ])('round trips %s', async (_, size, chunks) => {
    const { io, result, decrypt } = await setup(size);
    const source = generated(size);
    expect(result.bytes).toBe(size);
    expect(result.sha256).toBe(createHash('sha256').update(source).digest('hex'));

    const stored = io.files.get('store/a.enc') ?? new Uint8Array();
    const header = decodeHeader(stored.slice(0, HEADER_BYTES));
    expect(header?.version).toBe(1);
    expect(header?.chunkSize).toBe(CHUNK_SIZE);
    expect(Buffer.from(header?.assetId ?? []).toString('hex')).toBe(ASSET.replace(/-/g, ''));
    expect(chunksOf(stored)).toHaveLength(chunks);

    await decrypt();
    // Buffer.equals: a deep toEqual over millions of bytes is very slow in Jest.
    expect(Buffer.from(io.files.get('out/plain') ?? []).equals(Buffer.from(source))).toBe(true);
  });

  it('reads the source in pieces of at most 1 MiB', async () => {
    const { io } = await setup(CHUNK_SIZE * 3.5);
    const reads = io.reads.filter((r) => r.path === 'in/source');
    expect(reads.length).toBe(4);
    expect(reads.every((r) => r.length <= CHUNK_SIZE)).toBe(true);
  });

  it('gives a different ciphertext in every chunk for the same source', async () => {
    const a = await setup(CHUNK_SIZE * 2.5);
    const b = await setup(CHUNK_SIZE * 2.5);
    const ca = chunksOf(a.io.files.get('store/a.enc') ?? new Uint8Array());
    const cb = chunksOf(b.io.files.get('store/a.enc') ?? new Uint8Array());
    ca.forEach((chunk, i) =>
      expect(Buffer.from(chunk).equals(Buffer.from(cb[i] ?? []))).toBe(false),
    );
    expect(a.result.wrappedKey).not.toBe(b.result.wrappedKey);
  });
});

describe('tampering', () => {
  async function expectTampered(
    mutate: (s: Awaited<ReturnType<typeof setup>>) => Promise<void> | void,
    over = {},
  ) {
    const s = await setup(CHUNK_SIZE * 2.5);
    await mutate(s);
    await expect(s.decrypt(over)).rejects.toBeInstanceOf(TamperedFileError);
    expect(s.io.files.has('out/plain')).toBe(false);
  }

  it('detects one flipped ciphertext byte', async () => {
    await expectTampered(({ io }) => {
      const file = io.files.get('store/a.enc') ?? new Uint8Array();
      const index = HEADER_BYTES + RECORD + NONCE_BYTES + 100;
      file[index] = (file[index] ?? 0) ^ 1;
    });
  });

  it('detects two chunks swapped', async () => {
    await expectTampered(({ io }) => {
      const file = io.files.get('store/a.enc') ?? new Uint8Array();
      const [c0, c1, ...rest] = chunksOf(file);
      io.files.set(
        'store/a.enc',
        concat(
          file.slice(0, HEADER_BYTES),
          c1 ?? new Uint8Array(),
          c0 ?? new Uint8Array(),
          ...rest,
        ),
      );
    });
  });

  it('detects the final chunk cut off', async () => {
    await expectTampered(({ io }) => {
      const file = io.files.get('store/a.enc') ?? new Uint8Array();
      io.files.set('store/a.enc', file.slice(0, HEADER_BYTES + 2 * RECORD));
    });
  });

  it('detects a wrong asset id', async () => {
    await expectTampered(() => undefined, { assetId: OTHER });
  });

  it('detects a wrong master key', async () => {
    await expectTampered(() => undefined, { masterKey: nodeCipher.randomBytes(32) });
  });
});
