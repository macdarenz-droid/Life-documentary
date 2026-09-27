// Filmstrip (DESIGN §3 #5): the days as a horizontal strip of frames. Frames scale 1 → 0.92 with their
// distance from the centre (transform only, from a Reanimated scroll handler); the strip snaps per day
// with a selection haptic on each new day. Reduced motion: no scaling, the same snapping.
import { tokens } from '@life/design';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image, type ImageProps } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from '../Text';
import { useMotionPreference } from '../motionPreference';

export type FilmstripFrame = {
  date: string;
  label: string;
  /** The day's first poster; absent draws a plain `surface` frame. */
  poster?: Exclude<ImageProps['source'], undefined> | null;
};

export type FilmstripProps = {
  frames: FilmstripFrame[];
  selected?: string;
  onDay: (date: string) => void;
  /** Near the end of the strip: load older days. */
  onEndReached?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** DESIGN §3 #5: a frame far from the centre is drawn at 92%. */
export const FILMSTRIP_EDGE_SCALE = 0.92;
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 136;
const GAP = tokens.space[2];
const STEP = FRAME_WIDTH + GAP;

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<FilmstripFrame>);

function Frame({
  frame,
  index,
  selected,
  scrollX,
  viewport,
  reduced,
  onPress,
}: {
  frame: FilmstripFrame;
  index: number;
  selected: boolean;
  scrollX: SharedValue<number>;
  viewport: SharedValue<number>;
  reduced: boolean;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scale: 1 }] };
    const pad = Math.max(0, (viewport.value - STEP) / 2);
    const centre = pad + index * STEP + STEP / 2;
    const distance = Math.abs(centre - (scrollX.value + viewport.value / 2));
    return {
      transform: [
        {
          scale: interpolate(
            distance,
            [0, STEP * 2],
            [1, FILMSTRIP_EDGE_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={frame.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.cell}
    >
      <Animated.View style={[styles.frame, style]}>
        {frame.poster ? (
          <Image
            source={frame.poster}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        ) : null}
      </Animated.View>
      <Text
        variant="label"
        tone={selected ? 'text' : 'secondary'}
        accessibilityRole="none"
        style={styles.label}
      >
        {frame.label}
      </Text>
    </Pressable>
  );
}

export function Filmstrip({ frames, selected, onDay, onEndReached, style }: FilmstripProps) {
  const { reduced } = useMotionPreference();
  const scrollX = useSharedValue(0);
  const viewport = useSharedValue(0);
  const detent = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const list = useRef<{ scrollToIndex(p: { index: number; animated?: boolean }): void } | null>(
    null,
  );

  const tick = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const index = Math.round(event.contentOffset.x / STEP);
      if (index !== detent.value) {
        detent.value = index;
        scheduleOnRN(tick);
      }
    },
  });

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(
      0,
      Math.min(frames.length - 1, Math.round(event.nativeEvent.contentOffset.x / STEP)),
    );
    const frame = frames[index];
    if (frame && frame.date !== selected) onDay(frame.date);
  };

  const choose = (index: number) => {
    const frame = frames[index];
    if (!frame) return;
    if (frame.date !== selected) {
      tick();
      onDay(frame.date);
    }
    list.current?.scrollToIndex({ index, animated: !reduced });
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    viewport.value = w;
    setWidth(w);
  };

  // Side padding lets the first and last day sit in the centre.
  const pad = Math.max(0, (width - STEP) / 2);

  return (
    <View style={[styles.strip, style]} onLayout={onLayout}>
      <AnimatedFlashList
        ref={list as never}
        testID="filmstrip"
        data={frames}
        horizontal
        keyExtractor={(frame) => frame.date}
        extraData={selected}
        renderItem={({ item, index }: ListRenderItemInfo<FilmstripFrame>) => (
          <Frame
            frame={item}
            index={index}
            selected={item.date === selected}
            scrollX={scrollX}
            viewport={viewport}
            reduced={reduced}
            onPress={() => choose(index)}
          />
        )}
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingHorizontal: pad }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: FRAME_HEIGHT + tokens.space[6] },
  cell: { width: STEP, alignItems: 'center', gap: tokens.space[2] },
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    backgroundColor: tokens.color.surface,
  },
  label: { textAlign: 'center' },
});
