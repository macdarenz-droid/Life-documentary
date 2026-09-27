// A small encrypted poster for every photo and video (P10). The original is decrypted to the cache,
// the poster is made from it and encrypted next to the original, and both plain files are removed,
// whatever happens. A poster that cannot be made is simply absent (CLAUDE.md rule 10).
import { MediaAsset } from '@life/contracts';
import { encryptFile } from '../data/fileStore/fileStore';
import * as mediaAssets from '../data/repositories/mediaAssets';
import type { Poster, PosterMaker } from '../domain/capturePorts';
import { decryptToCache } from './playback';
import type { Store } from './ports';

/** The poster's longest side in pixels. */
export const POSTER_MAX_SIDE = 480;
/** A video's poster frame; a shorter video uses its first frame. */
export const POSTER_FRAME_MS = 500;

async function removeIfThere(store: Store, path: string | undefined | null) {
  if (path && (await store.io.exists(path))) await store.io.remove(path);
}

/** Makes the poster when the asset is a photo or video without one; true when a poster was stored. */
export async function ensurePoster(
  store: Store,
  posters: PosterMaker,
  assetId: string,
): Promise<boolean> {
  const asset = await mediaAssets.get(store.driver, assetId);
  if (!asset || asset.kind === 'audio' || asset.posterPath) return false;

  const posterPath = `${store.storeDir}/${assetId}.poster.lde`;
  let source: string | null = null;
  let poster: Poster | null = null;
  let stored = false;
  try {
    source = await decryptToCache(store, {
      assetId,
      sourcePath: asset.localPath,
      wrappedKey: asset.wrappedKey,
      dir: `${store.cacheDir}/playback`,
      name: `${assetId}.source`,
    });
    if (!source) return false;
    poster =
      asset.kind === 'video'
        ? await posters.fromVideo(
            source,
            (asset.durationMs ?? 0) < POSTER_FRAME_MS ? 0 : POSTER_FRAME_MS,
            POSTER_MAX_SIDE,
          )
        : await posters.fromPhoto(source, POSTER_MAX_SIDE);
    if (!poster) return false;
    const sealed = await encryptFile({
      io: store.io,
      cipher: store.cipher,
      masterKey: store.masterKey,
      sourcePath: poster.uri,
      destPath: posterPath,
      assetId,
    });
    await mediaAssets.put(
      store.driver,
      MediaAsset.parse({ ...asset, posterPath, posterWrappedKey: sealed.wrappedKey }),
    );
    stored = true;
    return true;
  } catch {
    return false;
  } finally {
    await removeIfThere(store, source);
    await removeIfThere(store, poster?.uri);
    if (!stored) await removeIfThere(store, posterPath);
  }
}
