// "One year ago today" (P10): a quiet card below the Today controls when that day has moments. It shows
// the first moment's poster, or its question or note, and opens the viewer on it. Never an amber action;
// with nothing from that day it is not shown at all.
import type { Uuid } from '@life/contracts';
import { rgba, tokens } from '@life/design';
import { words } from '@life/story';
import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FootageItem } from '../../application/footage';
import { Text } from '../../design-system';

export type OneYearAgoActions = {
  /** The moments of the same day one year ago, oldest first. */
  load(): Promise<FootageItem[]>;
  poster(assetId: Uuid): Promise<Exclude<ImageProps['source'], undefined> | null>;
};

export function OneYearAgo({
  actions,
  onOpen,
  reloadKey = 0,
}: {
  actions: OneYearAgoActions;
  /** Opens the viewer on the day's moments, the first one shown. */
  onOpen: (ids: Uuid[]) => void;
  reloadKey?: number;
}) {
  const [items, setItems] = useState<FootageItem[]>([]);
  const [poster, setPoster] = useState<Exclude<ImageProps['source'], undefined> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const found = await actions.load();
      const first = found[0];
      const image = first?.hasPoster && first.assetId ? await actions.poster(first.assetId) : null;
      if (!active) return;
      setItems(found);
      setPoster(image);
    })();
    return () => {
      active = false;
    };
  }, [actions, reloadKey]);

  const first = items[0];
  if (!first) return null;
  const line = first.questionText ?? first.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[words.footage.oneYearAgo, line].filter(Boolean).join(', ')}
      onPress={() => onOpen(items.map((i) => i.id))}
      style={styles.card}
    >
      <Text variant="label" tone="secondary" accessibilityRole="none">
        {words.footage.oneYearAgo}
      </Text>
      {poster ? (
        <View style={styles.poster}>
          <Image
            source={poster}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        </View>
      ) : line ? (
        <Text variant="body" accessibilityRole="none">
          {line}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: tokens.space[2],
    padding: tokens.space[4],
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.outline,
    borderColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
  poster: {
    aspectRatio: tokens.motion.letterboxAspect,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    backgroundColor: tokens.color.surface,
  },
});
