import { tokens } from '@life/design';
import { capture } from '@life/story';
import { RECORD_QUESTION_SCALE, recordPlan } from './recordPlan';

describe('recordPlan', () => {
  it('takes the limits from capture and the motion from tokens', () => {
    const plan = recordPlan(false);
    expect(plan.minMs).toBe(capture.answerMinMs);
    expect(plan.maxMs).toBe(capture.answerMaxMs);
    expect(plan.dim.ms).toBe(tokens.motion.duration.scene);
    expect(plan.question).toEqual({
      kind: 'move',
      spring: tokens.motion.spring.move,
      scale: RECORD_QUESTION_SCALE,
    });
    expect(plan.progress).toBe('ring');
    expect(plan.haptics).toEqual({ start: 'impactLight', stop: 'impactLight' });
  });

  it('keeps only a fade and a countdown under reduced motion', () => {
    const plan = recordPlan(true);
    expect(plan.dim.ms).toBe(tokens.motion.reducedMotion.fadeMs);
    expect(plan.question).toEqual({ kind: 'still' });
    expect(plan.progress).toBe('countdown');
  });
});
