import { describe, expect, it } from 'vitest';
import { type } from '../src';

describe('type', () => {
  it('has no variant between 17 and 33 pt', () => {
    for (const variant of Object.values(type)) {
      expect(variant.size < 17 || variant.size > 33).toBe(true);
    }
  });

  it('sets timecodes in tabular numbers', () => {
    expect(type.timecode.fontVariant).toContain('tabular-nums');
  });

  it('sets labels in uppercase with 6 % tracking', () => {
    expect(type.label.textTransform).toBe('uppercase');
    expect(type.label.letterSpacing).toBeCloseTo(0.72, 10);
  });
});
