// Record (DESIGN §3 #9) as pure data: the product limits from @life/story's capture, the motion from
// tokens.motion. Reduced motion keeps only fades and a numeric countdown: no transform anywhere.
import { tokens } from '@life/design';
import { capture } from '@life/story';

/** How far the question shrinks as it moves to the top; DESIGN names no token for it. */
export const RECORD_QUESTION_SCALE = 0.8;

export type RecordPlan = {
  minMs: number;
  maxMs: number;
  /** The screen dims to theatreBlack by opacity only. */
  dim: { ms: number };
  /** The question moves up and shrinks, or stays put under reduced motion. */
  question:
    { kind: 'move'; spring: typeof tokens.motion.spring.move; scale: number } | { kind: 'still' };
  /** An amber ring fills linearly over maxMs, or a timecode counts down. */
  progress: 'ring' | 'countdown';
  haptics: { start: 'impactLight'; stop: 'impactLight' };
};

export function recordPlan(reduced: boolean): RecordPlan {
  return {
    minMs: capture.answerMinMs,
    maxMs: capture.answerMaxMs,
    dim: { ms: reduced ? tokens.motion.reducedMotion.fadeMs : tokens.motion.duration.scene },
    question: reduced
      ? { kind: 'still' }
      : { kind: 'move', spring: tokens.motion.spring.move, scale: RECORD_QUESTION_SCALE },
    progress: reduced ? 'countdown' : 'ring',
    haptics: { start: tokens.haptics.recordStart, stop: tokens.haptics.recordStop },
  };
}
