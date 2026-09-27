// Posters over expo-video-thumbnails and expo-image-manipulator: a frame or the photo, resized so its
// longest side is at most `maxSide`, saved as a JPEG in the app cache. Any error gives null (no poster).
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import type { PosterMaker } from '../../domain/capturePorts';

/** The poster's longest side in pixels (P10). */
export const POSTER_MAX_SIDE = 480;
const COMPRESS = 0.7;

async function resized(uri: string, maxSide: number, compress = COMPRESS) {
  const image = await ImageManipulator.manipulate(uri).renderAsync();
  const context = ImageManipulator.manipulate(image);
  if (Math.max(image.width, image.height) > maxSide) {
    context.resize(image.width >= image.height ? { width: maxSide } : { height: maxSide });
  }
  const saved = await (
    await context.renderAsync()
  ).saveAsync({
    compress,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

function removeQuietly(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to clean up.
  }
}

export const expoPosterMaker: PosterMaker = {
  fromVideo: async (uri, atMs) => {
    let frame: string | undefined;
    try {
      const thumbnail = await getThumbnailAsync(uri, { time: atMs, quality: 1 });
      frame = thumbnail.uri;
      return await resized(frame, POSTER_MAX_SIDE);
    } catch {
      return null;
    } finally {
      if (frame) removeQuietly(frame);
    }
  },
  fromPhoto: async (uri, maxSide, quality) => {
    try {
      return await resized(uri, maxSide, quality);
    } catch {
      return null;
    }
  },
};
