// The VideoRecorder over a ready camera view. The length and frame size come from the recorded file, never
// from a clock or the requested quality; an unreadable file gives null and nothing is saved.
import type { VideoRecorder } from '../../domain/capturePorts';
import type { ReadVideoMetadata } from './videoMetadata';

/** The two camera methods the recorder needs (expo-camera's CameraView). */
export type RecordingView = {
  recordAsync(options: { maxDuration: number }): Promise<{ uri: string } | undefined>;
  stopRecording(): void;
  takePictureAsync(): Promise<{ uri: string; width: number; height: number }>;
};

export function createCameraRecorder(
  view: () => RecordingView | null,
  readMetadata: ReadVideoMetadata,
): VideoRecorder {
  let recording: Promise<{ uri: string } | undefined> | null = null;
  return {
    start: async (maxMs) => {
      const current = view();
      if (!current) throw new Error('The camera is not mounted');
      recording = current.recordAsync({ maxDuration: maxMs / 1000 });
    },
    stop: async () => {
      const pending = recording;
      if (!pending) return null;
      recording = null;
      view()?.stopRecording();
      const video = await pending;
      if (!video) return null;
      const meta = await readMetadata(video.uri);
      return meta ? { uri: video.uri, ...meta } : null;
    },
    takePhoto: async () => {
      const current = view();
      if (!current) return null;
      const photo = await current.takePictureAsync();
      return { uri: photo.uri, width: photo.width, height: photo.height };
    },
  };
}
