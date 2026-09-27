// The viewer's audio player over expo-audio: nothing on screen; plays while `playing`, reports its
// position in milliseconds, and calls onEnd when it finishes.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef } from 'react';
import type { AudioPlaybackProps } from '../../domain/capturePorts';

export function ExpoAudioView({ uri, playing, onEnd, onProgress }: AudioPlaybackProps) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  // Read inside the play effect without re-running it on every status tick.
  const latest = useRef(status);
  latest.current = status;

  useEffect(() => {
    if (playing) {
      const { currentTime, duration } = latest.current;
      if (duration > 0 && currentTime >= duration) void player.seekTo(0);
      player.play();
    } else {
      player.pause();
    }
  }, [player, playing]);

  useEffect(() => {
    onProgress(Math.round(status.currentTime * 1000), Math.round(status.duration * 1000));
  }, [status.currentTime, status.duration, onProgress]);

  useEffect(() => {
    if (status.didJustFinish) onEnd();
  }, [status.didJustFinish, onEnd]);

  return null;
}
