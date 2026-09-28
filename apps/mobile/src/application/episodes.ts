// The phone's episodes (P16, D42). The list, where this week stands, and offline copies: after sync, on
// Wi-Fi, the four newest ready episodes are downloaded through the EpisodeFiles port, encrypted into the
// file store (D14) and their plain files deleted. Older copies and replaced render versions go. The player
// reads a local copy through the playback cache, or streams the route with the session header.
import type { DeviceEpisode, Documentary } from '@life/contracts';
import { episodeWords, weekStatus, type WeekStatus } from '@life/story';
import { encryptFile } from '../data/fileStore/fileStore';
import { fromBase64, toBase64 } from '../data/fileStore/bytes';
import * as episodes from '../data/repositories/episodes';
import type { EpisodeFiles, EpisodeSource, Network } from '../domain/capturePorts';
import { decryptToCache } from './playback';
import type { Clock, Store } from './ports';

/** How many ready episodes are kept for offline viewing. */
export const OFFLINE_EPISODES = 4;
const ALL = 1000;

const offlineDir = (store: Store) => `${store.storeDir}/episodes`;
const downloadDir = (store: Store) => `${store.cacheDir}/downloads`;
const playbackDir = (store: Store) => `${store.cacheDir}/playback`;
/** The wrapped key of an encrypted copy sits next to it (the table has no column for it). */
const keyPath = (localPath: string) => `${localPath}.key`;

/** Where one episode stands: ready, being made, running late (past its hour) or couldn't be made. */
export type EpisodeStage = 'ready' | 'making' | 'late' | 'failed';
export type EpisodeRow = { episode: DeviceEpisode; stage: EpisodeStage };

function stageOf(episode: DeviceEpisode, now: string): EpisodeStage {
  if (episode.state === 'ready' || episode.state === 'failed') return episode.state;
  return episode.dueAt !== undefined && Date.parse(episode.dueAt) <= Date.parse(now)
    ? 'late'
    : 'making';
}

/** The documentary's episodes, newest first, each with where it stands now. */
export async function listEpisodes(
  store: Store,
  clock: Clock,
  documentary: Documentary,
): Promise<EpisodeRow[]> {
  const now = clock.now();
  return (await episodes.listRecent(store.driver, documentary.id, ALL)).map((episode) => ({
    episode,
    stage: stageOf(episode, now),
  }));
}

export async function getEpisode(store: Store, id: string): Promise<DeviceEpisode | null> {
  return (await episodes.get(store.driver, id)) ?? null;
}

export type ThisWeek = { status: WeekStatus; hour: number; number?: number };

/** Where this week's episode stands, from the phone's clock, the schedule and the newest summary. */
export async function thisWeek(
  store: Store,
  clock: Clock,
  documentary: Documentary,
): Promise<ThisWeek> {
  const [newest] = await episodes.listRecent(store.driver, documentary.id, 1);
  const status = weekStatus(
    documentary,
    clock.now(),
    newest ? { weekStart: newest.weekStart, state: newest.state } : undefined,
  );
  return {
    status,
    hour: documentary.episodeHour,
    ...(status === 'ready' && newest ? { number: newest.number } : {}),
  };
}

/** This week's line, or null when there is nothing to say yet (the first week is not over). */
export function weekLine(week: ThisWeek): string | null {
  switch (week.status) {
    case 'making':
      return episodeWords.making(week.hour);
    case 'late':
      return episodeWords.late;
    case 'failed':
      return episodeWords.failed;
    case 'quiet':
      return episodeWords.quiet;
    case 'ready':
      return week.number !== undefined ? episodeWords.ready(week.number) : null;
    case 'none':
      return null;
  }
}

async function removeIfThere(store: Store, path: string | undefined) {
  if (path && (await store.io.exists(path))) await store.io.remove(path);
}

async function dropCopy(store: Store, episode: DeviceEpisode): Promise<void> {
  if (episode.localPath === undefined) return;
  await removeIfThere(store, episode.localPath);
  await removeIfThere(store, keyPath(episode.localPath));
  const rest: DeviceEpisode = { ...episode };
  delete rest.localPath;
  delete rest.localRenderVersion;
  await episodes.put(store.driver, rest);
}

async function hasCopy(store: Store, episode: DeviceEpisode): Promise<boolean> {
  return (
    episode.localPath !== undefined &&
    (episode.localRenderVersion ?? -1) >= episode.renderVersion &&
    (await store.io.exists(episode.localPath)) &&
    (await store.io.exists(keyPath(episode.localPath)))
  );
}

/** Downloads, encrypts and records one episode's current render; the plain file never stays. */
async function saveOffline(
  store: Store,
  files: EpisodeFiles,
  episode: DeviceEpisode,
): Promise<void> {
  const { io } = store;
  const name = `${episode.id}.r${episode.renderVersion}`;
  const plain = `${downloadDir(store)}/${name}.mp4`;
  const localPath = `${offlineDir(store)}/${name}.lde`;
  let saved = false;
  try {
    await io.ensureDir(downloadDir(store));
    await io.ensureDir(offlineDir(store));
    await files.download(episode.id, plain);
    const sealed = await encryptFile({
      io,
      cipher: store.cipher,
      masterKey: store.masterKey,
      sourcePath: plain,
      destPath: localPath,
      assetId: episode.id,
    });
    await removeIfThere(store, keyPath(localPath));
    await io.append(keyPath(localPath), fromBase64(sealed.wrappedKey));
    // The older render's copy goes once the new one is in place.
    if (episode.localPath !== undefined && episode.localPath !== localPath) {
      await removeIfThere(store, episode.localPath);
      await removeIfThere(store, keyPath(episode.localPath));
    }
    await episodes.put(store.driver, {
      ...episode,
      localPath,
      localRenderVersion: episode.renderVersion,
    });
    saved = true;
  } finally {
    await removeIfThere(store, plain);
    await removeIfThere(store, `${plain}.part`);
    if (!saved) {
      await removeIfThere(store, localPath);
      await removeIfThere(store, keyPath(localPath));
    }
  }
}

export type DownloadOutcome = { downloaded: number; removed: number };

/**
 * Runs after sync: on Wi-Fi, keeps an encrypted copy of each of the four newest ready episodes at its
 * current render version, and deletes every other copy. A failed download is logged and left for the
 * next run.
 */
export async function downloadReady(
  store: Store,
  documentary: Documentary,
  network: Network,
  files: EpisodeFiles,
): Promise<DownloadOutcome> {
  const outcome: DownloadOutcome = { downloaded: 0, removed: 0 };
  if ((await network.connection()) !== 'wifi') return outcome;
  const all = await episodes.listRecent(store.driver, documentary.id, ALL);
  const keep = all.filter((e) => e.state === 'ready').slice(0, OFFLINE_EPISODES);
  const kept = new Set(keep.map((e) => e.id));

  for (const episode of all) {
    if (!kept.has(episode.id) && episode.localPath !== undefined) {
      await dropCopy(store, episode);
      outcome.removed += 1;
    }
  }
  for (const episode of keep) {
    if (await hasCopy(store, episode)) continue;
    try {
      await saveOffline(store, files, episode);
      outcome.downloaded += 1;
    } catch (error) {
      console.error('An episode was not saved for offline viewing.', error);
    }
  }
  // Anything else in the folder (an older render a killed run left) has no row pointing at it.
  const current = await episodes.listRecent(store.driver, documentary.id, ALL);
  const owned = new Set(
    current.flatMap((e) => (e.localPath ? [e.localPath, keyPath(e.localPath)] : [])),
  );
  for (const path of await store.io.list(offlineDir(store))) {
    if (!owned.has(path)) await store.io.remove(path);
  }
  return outcome;
}

/**
 * Where the player reads the episode: a plain copy of the local file in the playback cache, else the
 * route with the session header. Null when neither is there.
 */
export async function openEpisode(
  store: Store,
  files: EpisodeFiles | undefined,
  episode: DeviceEpisode,
): Promise<EpisodeSource | null> {
  if (episode.localPath !== undefined && (await store.io.exists(keyPath(episode.localPath)))) {
    const keyFile = keyPath(episode.localPath);
    const wrapped = await store.io.read(keyFile, 0, await store.io.size(keyFile));
    const uri = await decryptToCache(store, {
      assetId: episode.id,
      sourcePath: episode.localPath,
      wrappedKey: toBase64(wrapped),
      dir: playbackDir(store),
      name: `episode-${episode.id}`,
    }).catch((error: unknown) => {
      console.error('The offline episode could not be opened.', error);
      return null;
    });
    if (uri) return { uri };
  }
  return files?.stream(episode.id) ?? null;
}

/** Removes the episode's playback copy when the player closes. */
export async function closeEpisode(store: Store, episodeId: string): Promise<void> {
  for (const path of await store.io.list(playbackDir(store))) {
    if (path.slice(path.lastIndexOf('/') + 1).startsWith(`episode-${episodeId}.`)) {
      await store.io.remove(path);
    }
  }
}
