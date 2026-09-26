import { tokens } from '@life/design';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotionPreference } from '../motionPreference';
import { Text, type TextTone, type TextVariant } from '../Text';
import { textMorphPlan } from './textMorphPlan';

export type TextMorphProps = {
  text: string;
  variant: TextVariant;
  tone?: TextTone;
};

type CharMode = 'still' | 'enter' | 'exit' | 'hidden';

const easeOut = Easing.bezier(...tokens.motion.ease.out);
const { duration, spring, textMorph, reducedMotion } = tokens.motion;

function MorphChar({
  char,
  mode,
  delayMs,
  variant,
  tone,
}: {
  char: string;
  mode: CharMode;
  delayMs: number;
  variant: TextVariant;
  tone: TextTone;
}) {
  const shift = tokens.type[variant].lineHeight * textMorph.shift;
  const y = useSharedValue(mode === 'enter' ? shift : 0);
  const o = useSharedValue(mode === 'enter' || mode === 'hidden' ? 0 : 1);

  useEffect(() => {
    if (mode === 'enter') {
      y.value = withDelay(delayMs, withSpring(0, spring.press));
      o.value = withDelay(delayMs, withTiming(1, { duration: duration.micro, easing: easeOut }));
    } else if (mode === 'exit') {
      y.value = withDelay(delayMs, withSpring(-shift, spring.press));
      o.value = withDelay(delayMs, withTiming(0, { duration: duration.micro, easing: easeOut }));
    }
  }, [mode, delayMs, shift, y, o]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View style={style}>
      <Text variant={variant} tone={tone} accessibilityRole="none">
        {char}
      </Text>
    </Animated.View>
  );
}

function Fade({ to, children }: { to: 0 | 1; children: ReactNode }) {
  const o = useSharedValue(1 - to);
  useEffect(() => {
    o.value = withTiming(to, { duration: reducedMotion.fadeMs, easing: easeOut });
  }, [to, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Text Morph (DESIGN §3 #8): shared letters stay; the others slide 30% of the line and fade,
 * one every `stagger.char`, on `spring.press`. Reduced motion: the whole text crossfades.
 * The accessible label is always the new text.
 */
export function TextMorph({ text, variant, tone = 'text' }: TextMorphProps) {
  const { reduced } = useMotionPreference();
  const [change, setChange] = useState<{ from: string | null; to: string; generation: number }>({
    from: null,
    to: text,
    generation: 0,
  });
  // Derive the change during render (React's "adjust state when a prop changes"), so the old text never flashes.
  if (text !== change.to) {
    setChange((c) => ({ from: c.to, to: text, generation: c.generation + 1 }));
  }

  const { from, to, generation } = change;
  const plan = from === null ? null : textMorphPlan(from, to);
  const newChars = Array.from(to);

  let content: ReactNode;
  if (reduced || plan === null) {
    content = (
      <>
        {from !== null ? (
          <View style={StyleSheet.absoluteFill} key={`old-${generation}`}>
            <Fade to={0}>
              <Text variant={variant} tone={tone} accessibilityRole="none">
                {from}
              </Text>
            </Fade>
          </View>
        ) : null}
        {from !== null ? (
          <Fade to={1} key={`new-${generation}`}>
            <Text variant={variant} tone={tone} accessibilityRole="none">
              {to}
            </Text>
          </Fade>
        ) : (
          <Text variant={variant} tone={tone} accessibilityRole="none">
            {to}
          </Text>
        )}
      </>
    );
  } else {
    const oldChars = Array.from(from ?? '');
    content = (
      <>
        <View style={[StyleSheet.absoluteFill, styles.row]}>
          {oldChars.map((char, i) => {
            const k = plan.exit.indexOf(i);
            return (
              <MorphChar
                key={`${generation}-old-${i}`}
                char={char}
                mode={k === -1 ? 'hidden' : 'exit'}
                delayMs={k === -1 ? 0 : (plan.delays.exit[k] ?? 0)}
                variant={variant}
                tone={tone}
              />
            );
          })}
        </View>
        <View style={styles.row}>
          {newChars.map((char, i) => {
            const k = plan.enter.indexOf(i);
            return (
              <MorphChar
                key={`${generation}-new-${i}`}
                char={char}
                mode={k === -1 ? 'still' : 'enter'}
                delayMs={k === -1 ? 0 : (plan.delays.enter[k] ?? 0)}
                variant={variant}
                tone={tone}
              />
            );
          })}
        </View>
      </>
    );
  }

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
