import { describe, expect, it } from 'vitest';
import { captionScrimOpacity } from '../src/episode/captionScrim';

const FADE = 180;
const one = [{ fromMs: 5000, toMs: 7500 }];
const touching = [
  { fromMs: 5000, toMs: 6000 },
  { fromMs: 6000, toMs: 7500 },
];
const separate = [
  { fromMs: 1000, toMs: 2000 },
  { fromMs: 4000, toMs: 5000 },
];

describe('captionScrimOpacity', () => {
  it('is 0 before and after a run', () => {
    expect(captionScrimOpacity(5000 - FADE - 1, one, FADE)).toBe(0);
    expect(captionScrimOpacity(5000 - FADE, one, FADE)).toBe(0);
    expect(captionScrimOpacity(7500 + FADE, one, FADE)).toBe(0);
    expect(captionScrimOpacity(9000, one, FADE)).toBe(0);
  });

  it('is 0.5 halfway through the fade-in and 1 at the first caption', () => {
    expect(captionScrimOpacity(5000 - FADE / 2, one, FADE)).toBeCloseTo(0.5);
    expect(captionScrimOpacity(5000, one, FADE)).toBe(1);
  });

  it('fades out after the last caption ends', () => {
    expect(captionScrimOpacity(7500, one, FADE)).toBe(1);
    expect(captionScrimOpacity(7500 + FADE / 2, one, FADE)).toBeCloseTo(0.5);
  });

  it('stays 1 at the joint of two touching captions', () => {
    expect(captionScrimOpacity(6000, touching, FADE)).toBe(1);
    expect(captionScrimOpacity(5999, touching, FADE)).toBe(1);
    expect(captionScrimOpacity(6001, touching, FADE)).toBe(1);
  });

  it('fades two separate runs separately', () => {
    expect(captionScrimOpacity(1500, separate, FADE)).toBe(1);
    expect(captionScrimOpacity(2000 + FADE / 2, separate, FADE)).toBeCloseTo(0.5);
    expect(captionScrimOpacity(3000, separate, FADE)).toBe(0);
    expect(captionScrimOpacity(4000 - FADE / 2, separate, FADE)).toBeCloseTo(0.5);
    expect(captionScrimOpacity(4500, separate, FADE)).toBe(1);
  });

  it('does not depend on caption order', () => {
    expect(captionScrimOpacity(6000, [...touching].reverse(), FADE)).toBe(1);
  });
});
