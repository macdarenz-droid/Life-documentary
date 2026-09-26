// The camera for a ten-second answer: video mode, sound on, 1080p. It hands out a VideoRecorder only after
// onCameraReady, as expo-camera requires.
import { CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { VideoRecorder } from '../../domain/capturePorts';

/** 1080p portrait, as requested with videoQuality; expo-camera does not report the recorded size. */
const WIDTH = 1080;
const HEIGHT = 1920;

type Props = {
  facing?: 'front' | 'back';
  style?: StyleProp<ViewStyle>;
  /** Receives the recorder once the camera is ready, and null when the view goes away. */
  onRecorder: (recorder: VideoRecorder | null) => void;
};

export function CameraRecorderView({ facing = 'front', style, onRecorder }: Props) {
  const camera = useRef<CameraView>(null);
  const recording = useRef<{
    result: Promise<{ uri: string } | undefined>;
    startedAt: number;
  } | null>(null);

  const onReady = useCallback(() => {
    onRecorder({
      start: async (maxMs) => {
        const view = camera.current;
        if (!view) throw new Error('The camera is not mounted');
        recording.current = {
          result: view.recordAsync({ maxDuration: maxMs / 1000 }),
          startedAt: performance.now(),
        };
      },
      stop: async () => {
        const current = recording.current;
        if (!current) return null;
        camera.current?.stopRecording();
        const video = await current.result;
        recording.current = null;
        if (!video) return null;
        // Duration measured around the recording: expo-camera returns only the file URI.
        return {
          uri: video.uri,
          durationMs: Math.round(performance.now() - current.startedAt),
          width: WIDTH,
          height: HEIGHT,
        };
      },
    });
  }, [onRecorder]);

  useEffect(() => () => onRecorder(null), [onRecorder]);

  return (
    <CameraView
      ref={camera}
      style={style}
      mode="video"
      facing={facing}
      mute={false}
      videoQuality="1080p"
      onCameraReady={onReady}
    />
  );
}
