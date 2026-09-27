// The viewer's video player over expo-video: no native controls, plays once with sound, and holds its
// last frame at the end. Playing again after the end starts from the beginning.
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { VideoPlaybackProps } from '../../domain/capturePorts';

export function ExpoVideoView({ uri, playing, onEnd, style }: VideoPlaybackProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    const subscription = player.addListener('playToEnd', onEnd);
    return () => subscription.remove();
  }, [player, onEnd]);

  useEffect(() => {
    if (playing) {
      if (player.duration > 0 && player.currentTime >= player.duration) player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [player, playing]);

  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="contain"
      style={style as StyleProp<ViewStyle>}
    />
  );
}
