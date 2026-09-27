import { JPEG_HEAD, fileWithHead, ftyp } from '../data/fileStore/testing/containerFixtures';
import { captureMoment } from './captureMoment';
import { clearPlaybackCache, closeOriginal, openOriginal, openPoster } from './playback';
import { ensurePoster } from './posters';
import { POSTER_BYTES, todayHarness } from './testing/todayHarness';

const MOV = fileWithHead(ftyp('qt  '));

async function capturedVideo(bytes: Uint8Array) {
  const h = await todayHarness();
  h.store.io.files.set('tmp/source', bytes);
  const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
    kind: 'clip',
    media: {
      sourcePath: 'tmp/source',
      mediaKind: 'video',
      durationMs: 6000,
      width: 1080,
      height: 1920,
    },
    localOnly: false,
  });
  h.store.io.files.delete('tmp/source');
  return { h, assetId: moment.mediaAssetId! };
}

const cacheFiles = (files: Map<string, Uint8Array>) =>
  [...files.keys()].filter((p) => p.startsWith('cache/')).sort();

describe('playback copies', () => {
  it('opens a QuickTime original as a .mov with the original bytes, and removes it on close', async () => {
    const { h, assetId } = await capturedVideo(MOV);
    const path = await openOriginal(h.store, assetId);
    expect(path).toBe(`cache/playback/${assetId}.mov`);
    expect(h.store.io.files.get(path!)).toEqual(MOV);
    expect(cacheFiles(h.store.io.files)).toEqual([path]);

    await closeOriginal(h.store, assetId);
    expect(cacheFiles(h.store.io.files)).toEqual([]);
  });

  it('gives null and leaves no file for an original of unknown type', async () => {
    const random = new Uint8Array(4096).map((_, i) => (i * 31 + 17) & 255);
    const { h, assetId } = await capturedVideo(random);
    expect(await openOriginal(h.store, assetId)).toBeNull();
    expect(cacheFiles(h.store.io.files)).toEqual([]);
  });

  it('opens the poster as a .jpg and reuses the copy', async () => {
    const { h, assetId } = await capturedVideo(MOV);
    expect(await openPoster(h.store, assetId)).toBeNull();
    await ensurePoster(h.store, h.services.posters, assetId);

    const path = await openPoster(h.store, assetId);
    expect(path).toBe(`cache/posters/${assetId}.jpg`);
    expect(h.store.io.files.get(path!)).toEqual(POSTER_BYTES);
    const reads = h.store.io.reads.length;
    expect(await openPoster(h.store, assetId)).toBe(path);
    expect(h.store.io.reads.length).toBe(reads);
  });

  it('clearPlaybackCache empties both folders', async () => {
    const { h, assetId } = await capturedVideo(MOV);
    await ensurePoster(h.store, h.services.posters, assetId);
    await openOriginal(h.store, assetId);
    await openPoster(h.store, assetId);
    h.store.io.files.set('cache/playback/left-over.part', fileWithHead(JPEG_HEAD));
    expect(cacheFiles(h.store.io.files)).toHaveLength(3);

    await clearPlaybackCache(h.store);
    expect(cacheFiles(h.store.io.files)).toEqual([]);
    expect(h.store.io.files.has(`store/${assetId}.lde`)).toBe(true);
    expect(h.store.io.files.has(`store/${assetId}.poster.lde`)).toBe(true);
  });
});
