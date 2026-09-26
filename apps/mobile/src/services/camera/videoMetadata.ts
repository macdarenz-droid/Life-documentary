// Reads a recorded file's length and frame size with expo-video: a player loads the file, its sourceLoad
// event carries the duration and the video tracks, and the player is released. Missing is not a value:
// anything unreadable gives null.
import { createVideoPlayer } from 'expo-video';

export type VideoMetadata = { durationMs: number; width: number; height: number };
export type ReadVideoMetadata = (uri: string) => Promise<VideoMetadata | null>;

const LOAD_TIMEOUT_MS = 5000;

export const readVideoMetadata: ReadVideoMetadata = (uri) =>
  new Promise((resolve) => {
    const player = createVideoPlayer(uri);
    let settled = false;
    const done = (value: VideoMetadata | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      loaded.remove();
      status.remove();
      player.release();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), LOAD_TIMEOUT_MS);
    const loaded = player.addListener('sourceLoad', ({ duration, availableVideoTracks }) => {
      const size = availableVideoTracks[0]?.size;
      const durationMs = Math.round(duration * 1000);
      done(
        size && size.width > 0 && size.height > 0 && durationMs > 0
          ? { durationMs, width: size.width, height: size.height }
          : null,
      );
    });
    const status = player.addListener('statusChange', ({ status: s }) => {
      if (s === 'error') done(null);
    });
  });
