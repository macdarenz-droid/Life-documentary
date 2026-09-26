import { tokens } from '@life/design';
import { titleCardPlan, type TitleCardStep } from '@life/story';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotionPreference } from '../motionPreference';
import { Text } from '../Text';

export type TitleCardVariant = 'display64' | 'display48' | 'display34' | 'question';

export type TitleCardProps = {
  lines: string[];
  variant: TitleCardVariant;
  play: boolean;
  onDone?: () => void;
};

const easeOut = Easing.bezier(...tokens.motion.ease.out);
const TIMING = {
  wordStaggerMs: tokens.motion.stagger.word,
  wordDurationMs: tokens.motion.duration.title,
};

function Word({
  step,
  variant,
  play,
  reduced,
  last,
  endOfLine,
  onDone,
}: {
  step: TitleCardStep;
  endOfLine: boolean;
  variant: TitleCardVariant;
  play: boolean;
  reduced: boolean;
  last: boolean;
  onDone: (() => void) | undefined;
}) {
  const rise = tokens.type[variant].lineHeight;
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    if (!play) {
      progress.value = 0;
      return;
    }
    progress.value = withDelay(
      step.delayMs,
      withTiming(1, { duration: step.durationMs, easing: easeOut }, (finished) => {
        if (finished && last && onDone) scheduleOnRN(onDone);
      }),
    );
  }, [play, reduced, step.delayMs, step.durationMs, last, onDone, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * rise }],
  }));

  return (
    <Animated.View style={style}>
      <Text variant={variant} accessibilityRole="none">
        {endOfLine ? step.text : `${step.text} `}
      </Text>
    </Animated.View>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <View style={styles.line}>{children}</View>;
}

/**
 * Title Card (DESIGN §3 #3): each word rises from behind its line's clip, staggered across lines.
 * Reduced motion: the whole card fades in over `reducedMotion.fadeMs`, no translation.
 */
export function TitleCard({ lines, variant, play, onDone }: TitleCardProps) {
  const { reduced } = useMotionPreference();
  const plan = useMemo(() => titleCardPlan(lines, TIMING), [lines]);
  const fade: SharedValue<number> = useSharedValue(reduced ? 0 : 1);
  // The latest onDone, read when the reveal ends, so a new inline callback never restarts it.
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });
  const fireDone = useCallback(() => onDoneRef.current?.(), []);

  useEffect(() => {
    if (!reduced) {
      fade.value = 1;
      return;
    }
    if (!play) {
      fade.value = 0;
      return;
    }
    fade.value = withTiming(
      1,
      { duration: tokens.motion.reducedMotion.fadeMs, easing: easeOut },
      (finished) => {
        if (finished) scheduleOnRN(fireDone);
      },
    );
  }, [play, reduced, fireDone, fade]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const lastIndex = plan.steps.length - 1;

  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel={lines.join('\n')}
      style={fadeStyle}
    >
      {lines.map((_, lineIndex) => (
        <Line key={lineIndex}>
          {plan.steps.map((step, i) =>
            step.line === lineIndex ? (
              <Word
                key={i}
                step={step}
                variant={variant}
                play={play}
                reduced={reduced}
                last={i === lastIndex}
                endOfLine={plan.steps[i + 1]?.line !== lineIndex}
                onDone={reduced ? undefined : fireDone}
              />
            ) : null,
          )}
        </Line>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
});
