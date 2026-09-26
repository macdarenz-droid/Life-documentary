// The camera for a ten-second answer: video mode, sound on, 1080p. It hands out a VideoRecorder only after
// onCameraReady, as expo-camera requires; the recording's length and size are read from the file.
import { CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { CameraViewProps } from '../../domain/capturePorts';
import { createCameraRecorder } from './cameraRecorder';
import { readVideoMetadata, type ReadVideoMetadata } from './videoMetadata';

type Props = CameraViewProps & { readMetadata?: ReadVideoMetadata };

/** Hands out a VideoRecorder once the camera is ready, and null when the view goes away. */
export function CameraRecorderView({
  facing = 'front',
  mode = 'video',
  style,
  onRecorder,
  readMetadata = readVideoMetadata,
}: Props) {
  const camera = useRef<CameraView>(null);
  const onReady = useCallback(() => {
    onRecorder(createCameraRecorder(() => camera.current, readMetadata));
  }, [onRecorder, readMetadata]);

  useEffect(() => () => onRecorder(null), [onRecorder]);

  return (
    <CameraView
      ref={camera}
      style={style as StyleProp<ViewStyle>}
      mode={mode}
      facing={facing}
      mute={false}
      videoQuality="1080p"
      onCameraReady={onReady}
    />
  );
}
