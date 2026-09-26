// Tray (DESIGN §3 #6): a Reanimated bottom sheet (not a formSheet route, so it can sit inside Today and
// the Design Lab) with one detent at its content height. It rises on spring.move and follows the finger;
// a drag past a quarter of its height or a fast flick closes it. Reduced motion: it fades, no transform.
import { rgba, tokens } from '@life/design';
import { words } from '@life/story';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotionPreference } from './motionPreference';
import { Text } from './Text';

const CLOSE_FRACTION = 0.25;
const CLOSE_VELOCITY = 800;
/** Height used before the sheet has measured itself. */
const START_HEIGHT = 400;

export type TrayProps = {
  open: boolean;
  onClose: () => void;
  /** Read by screen readers as the sheet's name. */
  label: string;
  children: ReactNode;
};

export function Tray({ open, onClose, label, children }: TrayProps) {
  const { reduced } = useMotionPreference();
  const [mounted, setMounted] = useState(open);
  const height = useSharedValue(START_HEIGHT);
  const offset = useSharedValue(START_HEIGHT);
  const opacity = useSharedValue(0);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const done = () => {
      if (!open) setMounted(false);
    };
    if (reduced) {
      offset.value = 0;
      opacity.value = withTiming(
        open ? 1 : 0,
        { duration: tokens.motion.reducedMotion.fadeMs, easing: Easing.linear },
        (finished) => {
          if (finished) scheduleOnRN(done);
        },
      );
    } else {
      opacity.value = 1;
      offset.value = withSpring(open ? 0 : height.value, tokens.motion.spring.move, (finished) => {
        if (finished) scheduleOnRN(done);
      });
    }
  }, [open, reduced, offset, opacity, height]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (!reduced) offset.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > height.value * CLOSE_FRACTION || e.velocityY > CLOSE_VELOCITY) {
        scheduleOnRN(onClose);
      } else if (!reduced) {
        offset.value = withSpring(0, tokens.motion.spring.move);
      }
    });

  const sheetStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: opacity.value }
      : { opacity: opacity.value, transform: [{ translateY: offset.value }] },
  );
  const backdropStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: opacity.value }
      : { opacity: 1 - offset.value / Math.max(height.value, 1) },
  );

  if (!mounted) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={words.extras.close}
          onPress={onClose}
        />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          testID="tray-sheet"
          accessibilityViewIsModal
          accessibilityLabel={label}
          onLayout={onLayout}
          style={[styles.sheet, sheetStyle]}
        >
          <View style={styles.grip} />
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {label}
          </Text>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: rgba(tokens.color.scrim.hex, tokens.color.scrim.to) },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: tokens.space[4],
    padding: tokens.space[5],
    paddingBottom: tokens.space[7],
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
  },
  grip: {
    alignSelf: 'center',
    width: tokens.space[7],
    height: tokens.space[1],
    borderRadius: tokens.space[1],
    backgroundColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
});
