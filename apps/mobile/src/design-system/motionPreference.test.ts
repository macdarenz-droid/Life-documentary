import { tokens } from '@life/design';
import { pickMotion } from './motionPreference';

describe('pickMotion', () => {
  it('returns the spatial spring when motion is not reduced', () => {
    expect(pickMotion(false, tokens.motion.spring.press)).toBe(tokens.motion.spring.press);
  });

  it('returns a 180 ms fade when motion is reduced', () => {
    expect(pickMotion(true, tokens.motion.spring.press)).toEqual({ kind: 'fade', ms: 180 });
  });
});
