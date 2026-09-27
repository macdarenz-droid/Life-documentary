// The moment viewer (P10): one moment full screen on theatre black. A video plays once with sound and
// holds its last frame (a tap plays or pauses); a voice answer plays under its question with a timecode;
// a photo shows still; a note shows its text. Until transcripts exist, the caption is the question or the
// note, over a scrim; nothing is invented (CLAUDE.md rule 10). A quiet "Edit" opens the edit tray (T-009d).
import type { Uuid } from '@life/contracts';
import { rgba, tokens } from '@life/design';
import { durationLabel, words } from '@life/story';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PlaybackViews } from '../../application/captureContext';
import type { FootageItem } from '../../application/footage';
import { Text } from '../../design-system';
import { EditTray, type EditActions } from './EditTray';

export type ViewerActions = {
  load(id: Uuid): Promise<FootageItem | null>;
  /** A plain playback copy of the original, or null when it cannot be opened. */
  openOriginal(assetId: Uuid): Promise<string | null>;
  closeOriginal(assetId: Uuid): Promise<void>;
};

export type MomentViewerProps = {
  id: Uuid;
  actions: ViewerActions;
  Playback?: PlaybackViews;
  /** The edit tray's actions; without them no "Edit" is offered. */
  edit?: EditActions;
  /** Moves to the next moment of the same day; without it no "Next" is offered. */
  onNext?: () => void;
  onClose: () => void;
};

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; item: FootageItem; uri: string | null };

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text variant="label" tone="secondary" accessibilityRole="none">
        {label}
      </Text>
    </Pressable>
  );
}

export function MomentViewer({ id, actions, Playback, edit, onNext, onClose }: MomentViewerProps) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState({ at: 0, of: 0 });
  const [editing, setEditing] = useState(false);
  const opened = useRef<Uuid | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const item = await actions.load(id);
        if (!item) return active && setState({ status: 'failed' });
        if (!item.assetId) return active && setState({ status: 'ready', item, uri: null });
        opened.current = item.assetId;
        const uri = await actions.openOriginal(item.assetId);
        if (!active) return;
        setState(uri ? { status: 'ready', item, uri } : { status: 'failed' });
      } catch (error) {
        console.error('The moment could not be opened.', error);
        if (active) setState({ status: 'failed' });
      }
    })();
    return () => {
      active = false;
      const assetId = opened.current;
      opened.current = null;
      if (assetId) void actions.closeOriginal(assetId);
    };
  }, [id, actions]);

  const onEnd = useCallback(() => setPlaying(false), []);
  const onProgress = useCallback((at: number, of: number) => setProgress({ at, of }), []);
  const toggle = () => setPlaying((p) => !p);
  const closeNow = () => {
    const assetId = opened.current;
    opened.current = null;
    if (assetId) void actions.closeOriginal(assetId);
    onClose();
  };

  const reload = async () => {
    setEditing(false);
    const item = await actions.load(id);
    if (item) setState((s) => (s.status === 'ready' ? { ...s, item } : s));
  };

  const close = (
    <View style={styles.close}>
      {onNext ? <Link label={words.footage.next} onPress={onNext} /> : null}
      <Link label={words.footage.close} onPress={closeNow} />
    </View>
  );

  if (state.status === 'loading') return <View style={styles.screen}>{close}</View>;

  const media = state.status === 'ready' ? state.item.mediaKind : undefined;
  const cannotPlay =
    state.status === 'failed' || ((media === 'video' || media === 'audio') && !Playback);
  if (cannotPlay || state.status !== 'ready') {
    return (
      <View style={styles.screen}>
        {close}
        <View style={styles.centre}>
          <Text variant="body" tone="secondary">
            {words.footage.cannotOpen}
          </Text>
        </View>
      </View>
    );
  }

  const { item, uri } = state;
  const caption = item.kind === 'note' ? undefined : (item.questionText ?? item.text);
  const playLabel = playing ? words.footage.pause : words.footage.play;

  return (
    <View style={styles.screen}>
      {media === 'video' && uri && Playback ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playLabel}
          onPress={toggle}
          style={StyleSheet.absoluteFill}
        >
          <Playback.Video
            uri={uri}
            playing={playing}
            onEnd={onEnd}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
      ) : null}

      {media === 'photo' && uri ? (
        <Image
          source={{ uri }}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
          accessibilityLabel={words.footage.kinds.photo}
        />
      ) : null}

      {media === 'audio' && uri && Playback ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playLabel}
          onPress={toggle}
          style={styles.centre}
        >
          <Playback.Audio uri={uri} playing={playing} onEnd={onEnd} onProgress={onProgress} />
          {item.questionText ? (
            <Text variant="question" accessibilityRole="header" style={styles.centred}>
              {item.questionText}
            </Text>
          ) : null}
          <Text variant="timecode" tone="secondary" accessibilityRole="none">
            {`${durationLabel(progress.at)} / ${durationLabel(progress.of)}`}
          </Text>
        </Pressable>
      ) : null}

      {item.kind === 'note' ? (
        <View style={styles.centre}>
          <Text variant="display34" style={styles.centred}>
            {item.text ?? ''}
          </Text>
        </View>
      ) : null}

      {caption && media !== 'audio' ? (
        <View style={styles.caption} pointerEvents="none">
          <Text variant="body">{caption}</Text>
        </View>
      ) : null}

      {edit ? (
        <View style={styles.edit}>
          <Link label={words.footage.edit} onPress={() => setEditing(true)} />
        </View>
      ) : null}
      {close}
      {edit ? (
        <EditTray
          open={editing}
          item={item}
          actions={edit}
          onClose={() => setEditing(false)}
          onSaved={() => void reload()}
          onDeleted={closeNow}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.theatreBlack },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[5],
    padding: tokens.space[6],
  },
  centred: { textAlign: 'center' },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: tokens.space[5],
    paddingBottom: tokens.space[7],
    backgroundColor: rgba(tokens.color.scrim.hex, tokens.color.scrim.to),
  },
  close: {
    position: 'absolute',
    top: tokens.space[7],
    right: tokens.space[5],
    flexDirection: 'row',
    gap: tokens.space[5],
  },
  edit: { position: 'absolute', top: tokens.space[7], left: tokens.space[5] },
  link: { minHeight: 44, justifyContent: 'center' },
});
