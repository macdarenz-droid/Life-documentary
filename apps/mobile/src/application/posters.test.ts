import { decryptFile } from '../data/fileStore/fileStore';
import { JPEG_HEAD, fileWithHead, ftyp } from '../data/fileStore/testing/containerFixtures';
import * as mediaAssets from '../data/repositories/mediaAssets';
import { captureMoment, type MediaInput } from './captureMoment';
import { ensurePoster } from './posters';
import { POSTER_BYTES, todayHarness } from './testing/todayHarness';

const MOV = fileWithHead(ftyp('qt  '));
const JPG = fileWithHead(JPEG_HEAD);

async function captured(media: Omit<MediaInput, 'sourcePath'>, bytes: Uint8Array) {
  const h = await todayHarness();
  h.store.io.files.set('tmp/source', bytes);
  const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
    kind: media.mediaKind === 'photo' ? 'photo' : 'clip',
    media: { ...media, sourcePath: 'tmp/source' },
    localOnly: false,
  });
  h.store.io.files.delete('tmp/source');
  return { h, assetId: moment.mediaAssetId! };
}

/** Every file outside the encrypted store: plain copies that must not stay behind. */
const plainFiles = (files: Map<string, Uint8Array>) =>
  [...files.keys()].filter((p) => !p.startsWith('store/'));

async function decrypted(h: Awaited<ReturnType<typeof todayHarness>>, assetId: string) {
  const asset = (await mediaAssets.get(h.store.driver, assetId))!;
  await decryptFile({
    io: h.store.io,
    cipher: h.store.cipher,
    masterKey: h.store.masterKey,
    sourcePath: asset.posterPath!,
    destPath: 'check/poster',
    assetId,
    wrappedKey: asset.posterWrappedKey!,
  });
  return h.store.io.files.get('check/poster');
}

describe('ensurePoster', () => {
  it('makes an encrypted poster for a video from the frame at 500 ms', async () => {
    const { h, assetId } = await captured(
      { mediaKind: 'video', durationMs: 6000, width: 1080, height: 1920 },
      MOV,
    );
    expect(await ensurePoster(h.store, h.services.posters, assetId)).toBe(true);

    const asset = await mediaAssets.get(h.store.driver, assetId);
    expect(asset?.posterPath).toBe(`store/${assetId}.poster.lde`);
    expect(asset?.posterWrappedKey).toEqual(expect.any(String));
    expect(h.services.posters.calls).toEqual([
      { kind: 'video', uri: `cache/playback/${assetId}.source.mov`, at: 500, maxSide: 480 },
    ]);
    const stored = h.store.io.files.get(asset!.posterPath!)!;
    expect(Buffer.from(stored).includes(Buffer.from(POSTER_BYTES))).toBe(false);
    expect(await decrypted(h, assetId)).toEqual(POSTER_BYTES);
    h.store.io.files.delete('check/poster');
    expect(plainFiles(h.store.io.files)).toEqual([]);
  });

  it('uses the first frame of a video shorter than 500 ms', async () => {
    const { h, assetId } = await captured(
      { mediaKind: 'video', durationMs: 300, width: 1080, height: 1920 },
      MOV,
    );
    await ensurePoster(h.store, h.services.posters, assetId);
    expect(h.services.posters.calls[0]?.at).toBe(0);
  });

  it('makes an encrypted poster for a photo, 480 px on the longest side', async () => {
    const { h, assetId } = await captured({ mediaKind: 'photo', width: 3024, height: 4032 }, JPG);
    expect(await ensurePoster(h.store, h.services.posters, assetId)).toBe(true);
    expect(h.services.posters.calls).toEqual([
      { kind: 'photo', uri: `cache/playback/${assetId}.source.jpg`, at: 480 },
    ]);
    expect(await decrypted(h, assetId)).toEqual(POSTER_BYTES);
  });

  it('does nothing for a voice answer, or when the poster exists', async () => {
    const audio = await captured(
      { mediaKind: 'audio', durationMs: 6000 },
      fileWithHead(ftyp('M4A ')),
    );
    expect(await ensurePoster(audio.h.store, audio.h.services.posters, audio.assetId)).toBe(false);
    expect(audio.h.services.posters.calls).toEqual([]);
    expect(
      (await mediaAssets.get(audio.h.store.driver, audio.assetId))?.posterPath,
    ).toBeUndefined();

    const photo = await captured({ mediaKind: 'photo', width: 3024, height: 4032 }, JPG);
    await ensurePoster(photo.h.store, photo.h.services.posters, photo.assetId);
    expect(await ensurePoster(photo.h.store, photo.h.services.posters, photo.assetId)).toBe(false);
    expect(photo.h.services.posters.calls).toHaveLength(1);
  });

  it.each(['none', 'throw'] as const)(
    'leaves no plain file and no poster when the poster maker gives %s',
    async (mode) => {
      const { h, assetId } = await captured(
        { mediaKind: 'video', durationMs: 6000, width: 1080, height: 1920 },
        MOV,
      );
      h.services.posters.mode = mode;
      expect(await ensurePoster(h.store, h.services.posters, assetId)).toBe(false);
      expect((await mediaAssets.get(h.store.driver, assetId))?.posterPath).toBeUndefined();
      expect(plainFiles(h.store.io.files)).toEqual([]);
      expect([...h.store.io.files.keys()]).toEqual([`store/${assetId}.lde`]);
    },
  );
});
