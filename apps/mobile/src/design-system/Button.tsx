import { rgba, tokens } from '@life/design';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { OUTLINE_WIDTH } from './borders';
import { pickMotion, useMotionPreference } from './motionPreference';
import { Text } from './Text';

export type ButtonHaptic = 'impactLight' | 'selection';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  haptic?: ButtonHaptic;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
/** Pressed opacity in the reduced-motion path: the dimmed-chrome alpha. */
const PRESSED_OPACITY = tokens.color.textSecondary.alpha;
const fadeEasing = Easing.bezier(...tokens.motion.ease.out);

function fireHaptic(haptic: ButtonHaptic) {
  if (haptic === 'impactLight') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else {
    void Haptics.selectionAsync();
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  haptic,
}: ButtonProps) {
  const { reduced } = useMotionPreference();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: 1 - pressed.value * (1 - PRESSED_OPACITY) }
      : { transform: [{ scale: 1 - pressed.value * (1 - tokens.motion.scale.press) }] },
  );

  const animateTo = (target: 0 | 1) => {
    const motion = pickMotion(reduced, tokens.motion.spring.press);
    pressed.value =
      'kind' in motion
        ? withTiming(target, { duration: motion.ms, easing: fadeEasing })
        : withSpring(target, motion);
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        if (haptic) fireHaptic(haptic);
        animateTo(1);
      }}
      onPressOut={() => animateTo(0)}
      style={[styles.base, variant === 'primary' ? styles.primary : styles.quiet, animatedStyle]}
    >
      <Text
        variant="bodyStrong"
        tone={variant === 'primary' ? 'onAccent' : 'text'}
        accessibilityRole="none"
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.space[7],
    minWidth: tokens.space[7],
    paddingHorizontal: tokens.space[5],
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: tokens.color.accent },
  quiet: {
    backgroundColor: 'transparent',
    borderWidth: OUTLINE_WIDTH,
    borderColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
});
