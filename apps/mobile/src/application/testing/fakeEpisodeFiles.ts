// An EpisodeFiles for tests: a download writes an MP4 to `<dest>.part` and moves it into place, or, for
// an id in `failing`, removes the part and throws, as the device port does. Every call is recorded.
import type { DeviceEpisode } from '@life/contracts';
import * as episodes from '../../data/repositories/episodes';
import type { EpisodeFiles } from '../../domain/capturePorts';
import type { Store } from '../ports';
import type { MemoryFileIO } from '../../data/fileStore/testing/memoryFileIO';
import { fileWithHead, ftyp } from '../../data/fileStore/testing/containerFixtures';

export const EPISODE_MP4 = fileWithHead(ftyp('isom'), 3000);
export const FAKE_EPISODE_URL = 'https://api.test/episodes';

export type FakeEpisodeFiles = EpisodeFiles & {
  downloads: string[];
  failing: Set<string>;
  signedIn: boolean;
};

export function fakeEpisodeFiles(io: MemoryFileIO): FakeEpisodeFiles {
  const files: FakeEpisodeFiles = {
    downloads: [],
    failing: new Set(),
    signedIn: true,
    download: async (episodeId, dest) => {
      files.downloads.push(episodeId);
      const part = `${dest}.part`;
      io.files.set(part, EPISODE_MP4.slice(0, 100));
      if (files.failing.has(episodeId)) {
        io.files.delete(part);
        throw new Error('response has status 404');
      }
      io.files.set(part, EPISODE_MP4);
      await io.move(part, dest);
    },
    stream: (episodeId) =>
      files.signedIn
        ? {
            uri: `${FAKE_EPISODE_URL}/${episodeId}/video`,
            headers: { cookie: 'life.session_token=fake' },
          }
        : null,
  };
  return files;
}

/** Stores an episode row as a pulled summary would land, for screen tests that cannot reach data/. */
export function storeEpisode(store: Store, episode: DeviceEpisode): Promise<DeviceEpisode> {
  return episodes.put(store.driver, episode);
}
