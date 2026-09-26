import { tokens } from '@life/design';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotionPreference } from '../motionPreference';
import { GRAIN_SHADER } from './grainShader';

export type GrainBreathProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const { texture, ease } = tokens.motion;
const inOut = Easing.bezier(...ease.inOut);
const MS_PER_SECOND = 1000;
const grainEffect = Skia.RuntimeEffect.Make(GRAIN_SHADER);

/**
 * Grain and Breath (DESIGN §3 #7), for hero surfaces only: a slow Ken Burns on the children
 * and a film-grain overlay whose seed advances at `texture.grainFps`.
 * Reduced motion: no scale animation and a static grain frame.
 */
export function GrainBreath({ children, style }: GrainBreathProps) {
  const { reduced } = useMotionPreference();
  const scale = useSharedValue<number>(texture.kenBurns.from);
  const seed = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(scale);
      scale.value = texture.kenBurns.from;
      return;
    }
    scale.value = withRepeat(
      withTiming(texture.kenBurns.to, { duration: texture.kenBurns.ms, easing: inOut }),
      -1,
      true,
    );
    return () => cancelAnimation(scale);
  }, [reduced, scale]);

  const grainClock = useFrameCallback((frame) => {
    seed.value = Math.floor((frame.timeSinceFirstFrame * texture.grainFps) / MS_PER_SECOND);
  }, !reduced);

  useEffect(() => {
    grainClock.setActive(!reduced);
  }, [reduced, grainClock]);

  const uniforms = useDerivedValue(() => ({ uSeed: seed.value, uOpacity: texture.grainOpacity }));
  const breath = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[styles.frame, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, breath]}>{children}</Animated.View>
      <View testID="grain-overlay" pointerEvents="none" style={StyleSheet.absoluteFill}>
        {grainEffect ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Fill>
              <Shader source={grainEffect} uniforms={uniforms} />
            </Fill>
          </Canvas>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
