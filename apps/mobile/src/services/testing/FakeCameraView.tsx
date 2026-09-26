// A camera view for tests and the Design Lab: a dark frame that hands out a fake VideoRecorder.
import { tokens } from '@life/design';
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { CameraViewProps, VideoRecorder } from '../../domain/capturePorts';

export function fakeCameraView(recorder: VideoRecorder) {
  return function FakeCameraView({ onRecorder, style }: CameraViewProps) {
    useEffect(() => {
      onRecorder(recorder);
      return () => onRecorder(null);
    }, [onRecorder]);
    return (
      <View
        testID="camera-preview"
        style={[{ backgroundColor: tokens.color.surface }, style as StyleProp<ViewStyle>]}
      />
    );
  };
}
