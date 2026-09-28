// One episode full screen on theatre black (P16, D42): the EpisodePlayer view with native controls, from
// the local copy when there is one, else streamed. A quiet "Close" goes back.
import type { DeviceEpisode, Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { episodeWords } from '@life/story';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PlaybackViews } from '../../application/captureContext';
import type { EpisodeSource } from '../../domain/capturePorts';
import { Text } from '../../design-system';

export type EpisodeActions = {
  load(id: Uuid): Promise<DeviceEpisode | null>;
  /** Where to play from, or null when it cannot be played now. */
  open(episode: DeviceEpisode): Promise<EpisodeSource | null>;
  close(id: Uuid): Promise<void>;
};

export type EpisodeScreenProps = {
  id: Uuid;
  actions: EpisodeActions;
  Playback?: PlaybackViews;
  onClose: () => void;
};

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; episode: DeviceEpisode; source: EpisodeSource };

export function EpisodeScreen({ id, actions, Playback, onClose }: EpisodeScreenProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const episode = await actions.load(id);
        const source = episode?.state === 'ready' ? await actions.open(episode) : null;
        if (!active) return;
        setState(episode && source ? { status: 'ready', episode, source } : { status: 'failed' });
      } catch (error) {
        console.error('The episode could not be opened.', error);
        if (active) setState({ status: 'failed' });
      }
    })();
    return () => {
      active = false;
      void actions.close(id);
    };
  }, [id, actions]);

  const title =
    state.status === 'ready'
      ? (state.episode.title ?? episodeWords.label(state.episode.number))
      : '';
  return (
    <View style={styles.screen}>
      {state.status === 'ready' && Playback ? (
        <Playback.Episode
          source={state.source}
          label={episodeWords.playing(title)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {state.status === 'failed' || (state.status === 'ready' && !Playback) ? (
        <View style={styles.center}>
          <Text variant="body">{episodeWords.openError}</Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
        <Text variant="label" tone="secondary" accessibilityRole="none">
          {episodeWords.close}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.theatreBlack },
  center: { flex: 1, justifyContent: 'center', padding: tokens.space[5] },
  close: {
    position: 'absolute',
    top: tokens.space[7],
    left: tokens.space[5],
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
});
