// The episode player over expo-video (P16): full screen with native controls, no picture in picture. It
// plays a local plain copy, or streams the route with the session header. The captions are in the picture.
import { useVideoPlayer, VideoView } from 'expo-video';
import type { StyleProp, ViewStyle } from 'react-native';
import type { EpisodePlaybackProps } from '../../domain/capturePorts';

export function EpisodePlayer({ source, label, style }: EpisodePlaybackProps) {
  const player = useVideoPlayer(
    source.headers ? { uri: source.uri, headers: source.headers } : { uri: source.uri },
    (p) => {
      p.loop = false;
      p.muted = false;
      p.play();
    },
  );
  return (
    <VideoView
      player={player}
      nativeControls
      allowsPictureInPicture={false}
      contentFit="contain"
      accessibilityLabel={label}
      style={style as StyleProp<ViewStyle>}
    />
  );
}
