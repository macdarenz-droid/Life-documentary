// The EpisodeFiles port over expo-file-system (P16, D42): `GET /episodes/:id/video` with the session
// cookie. A download lands in `<dest>.part` and is moved into place only when it worked; a failed one
// (a non-2xx answer rejects) leaves no file. Streaming hands the player the route and the same header.
import { File } from 'expo-file-system';
import type { EpisodeFiles } from '../../domain/capturePorts';

export function expoEpisodeFiles(baseUrl: string, cookie: () => string | null): EpisodeFiles {
  const url = (episodeId: string) => `${baseUrl}/episodes/${episodeId}/video`;
  return {
    download: async (episodeId, dest) => {
      const session = cookie();
      if (!session) throw new Error('Not signed in.');
      const part = new File(`${dest}.part`);
      try {
        await File.downloadFileAsync(url(episodeId), part, {
          headers: { cookie: session },
          idempotent: true,
        });
        const target = new File(dest);
        if (target.exists) target.delete();
        await part.move(target);
      } catch (error) {
        if (part.exists) part.delete();
        throw error;
      }
    },
    stream: (episodeId) => {
      const session = cookie();
      return session ? { uri: url(episodeId), headers: { cookie: session } } : null;
    },
  };
}
