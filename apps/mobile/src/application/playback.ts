// Plain copies for the players: an encrypted original or poster is decrypted into the app cache under
// a name with the right extension, read from its first bytes. The cache is emptied at every start.
import { decryptFile } from '../data/fileStore/fileStore';
import { CONTAINER_HEAD_BYTES, containerOf } from '../data/fileStore/container';
import * as mediaAssets from '../data/repositories/mediaAssets';
import type { Store } from './ports';

const PLAYBACK = 'playback';
const POSTERS = 'posters';

const folder = (store: Store, name: string) => `${store.cacheDir}/${name}`;

/**
 * Decrypts `sourcePath` to `<dir>/<name>.<ext>` through a `.part` file; null (and no file) when the
 * container is unknown. Throws when the file cannot be decrypted, leaving nothing behind.
 */
export async function decryptToCache(
  store: Store,
  input: { assetId: string; sourcePath: string; wrappedKey: string; dir: string; name: string },
): Promise<string | null> {
  const { io } = store;
  const part = `${input.dir}/${input.name}.part`;
  await io.ensureDir(input.dir);
  await decryptFile({
    io,
    cipher: store.cipher,
    masterKey: store.masterKey,
    sourcePath: input.sourcePath,
    destPath: part,
    assetId: input.assetId,
    wrappedKey: input.wrappedKey,
  });
  const size = await io.size(part);
  const ext = containerOf(await io.read(part, 0, Math.min(CONTAINER_HEAD_BYTES, size)));
  if (!ext) {
    await io.remove(part);
    return null;
  }
  const path = `${input.dir}/${input.name}.${ext}`;
  await io.move(part, path);
  return path;
}

async function findCopy(store: Store, dir: string, assetId: string): Promise<string | undefined> {
  return (await store.io.list(dir)).find((p) => {
    const file = p.slice(p.lastIndexOf('/') + 1);
    return file.startsWith(`${assetId}.`) && !file.endsWith('.part');
  });
}

/** A plain copy of the original for the player, or null when the asset or its container is unknown. */
export async function openOriginal(store: Store, assetId: string): Promise<string | null> {
  const asset = await mediaAssets.get(store.driver, assetId);
  if (!asset) return null;
  const dir = folder(store, PLAYBACK);
  const existing = await findCopy(store, dir, assetId);
  if (existing) await store.io.remove(existing);
  return decryptToCache(store, {
    assetId,
    sourcePath: asset.localPath,
    wrappedKey: asset.wrappedKey,
    dir,
    name: assetId,
  });
}

/** A plain copy of the poster, reused while it exists; null when there is none. */
export async function openPoster(store: Store, assetId: string): Promise<string | null> {
  const asset = await mediaAssets.get(store.driver, assetId);
  if (!asset?.posterPath || !asset.posterWrappedKey) return null;
  const dir = folder(store, POSTERS);
  const existing = await findCopy(store, dir, assetId);
  if (existing) return existing;
  return decryptToCache(store, {
    assetId,
    sourcePath: asset.posterPath,
    wrappedKey: asset.posterWrappedKey,
    dir,
    name: assetId,
  });
}

/** Removes the playback copy when the viewer closes. */
export async function closeOriginal(store: Store, assetId: string): Promise<void> {
  const existing = await findCopy(store, folder(store, PLAYBACK), assetId);
  if (existing) await store.io.remove(existing);
}

/** Empties both cache folders; runs once after the store opens. */
export async function clearPlaybackCache(store: Store): Promise<void> {
  for (const name of [PLAYBACK, POSTERS]) {
    for (const path of await store.io.list(folder(store, name))) await store.io.remove(path);
  }
}
