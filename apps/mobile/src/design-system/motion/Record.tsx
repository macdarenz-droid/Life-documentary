// Record (DESIGN §3 #9): while the person holds to answer, the screen dims to theatreBlack (opacity
// only), the question moves to the top and shrinks, and an amber ring fills over the recording limit.
// Reduced motion: the dim fades, the question stays, and a timecode counts down instead of the ring.
import { rgba, tokens } from '@life/design';
import { countdownLabel, secondsLeft } from '@life/story';
import { Suspense, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotionPreference } from '../motionPreference';
import { Text } from '../Text';
import { recordPlan } from './recordPlan';
import { RecordRing } from './recordRingLoader';

const RING_SIZE = 112;

export type RecordProps = {
  recording: boolean;
  /** Milliseconds recorded so far, for the countdown. */
  elapsedMs: number;
  /** A live camera preview is showing under the Record layer: dim with the scrim, not theatreBlack. */
  overPreview?: boolean;
  /** The question, moved to the top while recording. */
  question: ReactNode;
  /** The record button, which stays under the finger. */
  button: ReactNode;
};

export function Record({
  recording,
  elapsedMs,
  overPreview = false,
  question,
  button,
}: RecordProps) {
  const { reduced } = useMotionPreference();
  const plan = recordPlan(reduced);
  const dim = useSharedValue(0);
  const lift = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    dim.value = withTiming(recording ? 1 : 0, { duration: plan.dim.ms, easing: Easing.linear });
    if (plan.question.kind === 'move') {
      lift.value = withSpring(recording ? 1 : 0, plan.question.spring);
    }
    if (recording) {
      ring.value = 0;
      ring.value = withTiming(1, { duration: plan.maxMs, easing: Easing.linear });
    } else {
      cancelAnimation(ring);
      ring.value = 0;
    }
  }, [recording, plan.dim.ms, plan.maxMs, plan.question, dim, lift, ring]);

  const scale = plan.question.kind === 'move' ? plan.question.scale : 1;
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const questionStyle = useAnimatedStyle(() =>
    plan.question.kind === 'move'
      ? {
          transform: [
            { translateY: -lift.value * tokens.space[8] },
            { scale: 1 - lift.value * (1 - scale) },
          ],
        }
      : {},
  );

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, overPreview ? styles.scrim : styles.dim, dimStyle]}
      />
      <Animated.View style={[styles.question, questionStyle]}>{question}</Animated.View>
      <View style={styles.control}>
        {recording ? (
          plan.progress === 'ring' ? (
            <View style={styles.ring} pointerEvents="none">
              <Suspense fallback={null}>
                <RecordRing progress={ring} size={RING_SIZE} />
              </Suspense>
            </View>
          ) : (
            <Text variant="timecode" tone="accent">
              {countdownLabel(secondsLeft(elapsedMs, plan.maxMs))}
            </Text>
          )
        ) : null}
        {button}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  dim: { backgroundColor: tokens.color.theatreBlack },
  scrim: { backgroundColor: rgba(tokens.color.scrim.hex, tokens.color.scrim.to) },
  question: { paddingTop: tokens.space[7] },
  control: { alignItems: 'center', gap: tokens.space[4], paddingBottom: tokens.space[7] },
  ring: { width: RING_SIZE, height: RING_SIZE },
});
