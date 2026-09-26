import { describe, expect, it } from 'vitest';
import { contrastRatio, tokens } from '../src';

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });
  it('is 1 for a colour on itself', () => {
    expect(contrastRatio(tokens.color.accent, tokens.color.accent)).toBe(1);
  });
  it('meets the targets for the theme colours on the background', () => {
    const bg = tokens.color.background;
    expect(contrastRatio(tokens.color.text, bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens.color.accent, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.color.focus, bg)).toBeGreaterThanOrEqual(3);
  });
});
