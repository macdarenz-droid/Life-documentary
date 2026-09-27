// Player views for tests and the Design Lab: a dark frame for video and nothing for audio, each showing
// whether it plays. The audio fake reports a 6 s file at its start.
import { tokens } from '@life/design';
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { PlaybackViews } from '../../application/captureContext';
import type { AudioPlaybackProps, VideoPlaybackProps } from '../../domain/capturePorts';

export const FAKE_AUDIO_MS = 6000;

function FakeVideoView({ uri, playing, style }: VideoPlaybackProps) {
  return (
    <View
      testID="video-player"
      accessibilityValue={{ text: `${uri} ${playing ? 'playing' : 'paused'}` }}
      style={[{ backgroundColor: tokens.color.surface }, style as StyleProp<ViewStyle>]}
    />
  );
}

function FakeAudioView({ uri, playing, onProgress }: AudioPlaybackProps) {
  useEffect(() => {
    onProgress(0, FAKE_AUDIO_MS);
  }, [onProgress]);
  return (
    <View
      testID="audio-player"
      accessibilityValue={{ text: `${uri} ${playing ? 'playing' : 'paused'}` }}
    />
  );
}

export const fakePlayback: PlaybackViews = { Video: FakeVideoView, Audio: FakeAudioView };
