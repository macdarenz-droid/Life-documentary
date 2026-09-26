import { describe, expect, it } from 'vitest';
import { capture, countdownLabel, dayLabel, secondsLeft } from '../src';

describe('capture', () => {
  it('holds the answer limits', () => {
    expect(capture).toEqual({ answerMinMs: 1000, answerMaxMs: 10000, libraryClipMaxMs: 60000 });
  });
  it('labels a day', () => {
    expect(dayLabel('2026-09-26')).toBe('Saturday 26 September');
  });
  it('counts seconds left, rounded up, never below zero', () => {
    expect(secondsLeft(0)).toBe(10);
    expect(secondsLeft(999)).toBe(10);
    expect(secondsLeft(1000)).toBe(9);
    expect(secondsLeft(12000)).toBe(0);
    expect(countdownLabel(7)).toBe('0:07');
  });
});
