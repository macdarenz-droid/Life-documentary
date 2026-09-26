import { tokens } from '@life/design';
import { Image, type ImageProps } from 'expo-image';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotionPreference } from '../motionPreference';

type FrameSource = Exclude<ImageProps['source'], undefined>;

export type DissolveProps = {
  source: FrameSource;
  recyclingKey: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

type Frame = { source: FrameSource; key: string };

const dissolveEasing = Easing.bezier(...tokens.motion.ease.dissolve);
const { duration, texture } = tokens.motion;

function FadingLayer({
  from,
  to,
  onDone,
  children,
}: {
  from: 0 | 1;
  to: 0 | 1;
  onDone?: () => void;
  children: ReactNode;
}) {
  const o = useSharedValue<number>(from);
  useEffect(() => {
    if (from === to) return;
    o.value = withTiming(
      to,
      { duration: duration.dissolve, easing: dissolveEasing },
      (finished) => {
        if (finished && onDone) scheduleOnRN(onDone);
      },
    );
  }, [from, to, onDone, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/**
 * Dissolve (DESIGN §3 #4): the new frame fades in over `duration.dissolve` on `ease.dissolve`
 * while the outgoing frame gives way to a copy of itself blurred by `texture.crossfadeBlurPx`.
 * Reduced motion: a plain crossfade, no blur.
 */
export function Dissolve({ source, recyclingKey, accessibilityLabel, style }: DissolveProps) {
  const { reduced } = useMotionPreference();
  const [state, setState] = useState<{ prev: Frame | null; current: Frame; generation: number }>({
    prev: null,
    current: { source, key: recyclingKey },
    generation: 0,
  });
  if (recyclingKey !== state.current.key) {
    setState((s) => ({
      prev: s.current,
      current: { source, key: recyclingKey },
      generation: s.generation + 1,
    }));
  }
  const { prev, current, generation } = state;
  const clearPrev = useCallback(
    () => setState((s) => (s.generation === generation ? { ...s, prev: null } : s)),
    [generation],
  );

  const image = (frame: Frame, extra?: Partial<ImageProps>) => (
    <Image
      source={frame.source}
      recyclingKey={frame.key}
      contentFit="cover"
      style={StyleSheet.absoluteFill}
      {...extra}
    />
  );

  return (
    <View style={[styles.frame, style]}>
      {prev ? (
        <View
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {reduced ? null : image(prev, { blurRadius: texture.crossfadeBlurPx })}
          {reduced ? (
            // Stays fully opaque under the incoming frame, so the crossfade never dims.
            <View style={StyleSheet.absoluteFill}>{image(prev)}</View>
          ) : (
            <FadingLayer key={`out-${generation}`} from={1} to={0}>
              {image(prev)}
            </FadingLayer>
          )}
        </View>
      ) : null}
      <FadingLayer
        key={`in-${generation}`}
        from={generation === 0 ? 1 : 0}
        to={1}
        onDone={clearPrev}
      >
        {image(
          current,
          accessibilityLabel === undefined
            ? { accessible: false }
            : { accessible: true, accessibilityRole: 'image', accessibilityLabel },
        )}
      </FadingLayer>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
