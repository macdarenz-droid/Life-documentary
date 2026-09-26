import { describe, expect, it } from 'vitest';
import { dampingFromRatio, duration, ease, spring, stagger } from '../src';

const ratioOf = (s: { mass: number; stiffness: number; damping: number }) =>
  s.damping / (2 * Math.sqrt(s.stiffness * s.mass));

describe('dampingFromRatio', () => {
  it('matches the DESIGN §2 values', () => {
    expect(dampingFromRatio(0.9, 1400, 1)).toBe(67);
    expect(dampingFromRatio(0.9, 700, 1)).toBe(48);
    expect(dampingFromRatio(0.9, 300, 1)).toBe(31);
    expect(dampingFromRatio(1, 1600, 1)).toBe(80);
  });
});

describe('spring', () => {
  it('never damps below a ratio of 0.85', () => {
    for (const s of [spring.press, spring.move, spring.scene, spring.effect]) {
      expect(ratioOf(s)).toBeGreaterThanOrEqual(0.85);
    }
    expect(spring.release.dampingRatio).toBeGreaterThanOrEqual(0.85);
  });
});

describe('ease', () => {
  it('holds cubic-bezier curves with x1 and x2 in [0, 1]', () => {
    for (const curve of Object.values(ease)) {
      expect(curve).toHaveLength(4);
      const [x1, , x2] = curve;
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });
});

describe('stagger', () => {
  it('fits a capped list inside one UI duration', () => {
    expect(stagger.list * stagger.listCap).toBeLessThanOrEqual(duration.ui);
  });
});
