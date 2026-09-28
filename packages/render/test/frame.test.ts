import { describe, expect, it } from 'vitest';
import { letterboxBarPx, mediaFit } from '../src/frame';

const ASPECT = 2.39;

describe('letterboxBarPx', () => {
  it('gives bars of 10% of the height in 9:16', () => {
    expect(letterboxBarPx(1080, 1920, ASPECT)).toBe(192);
  });

  it('leaves a 2.39:1 band in 16:9', () => {
    const bar = letterboxBarPx(1920, 1080, ASPECT);
    expect(bar).toBe(138);
    expect(1920 / (1080 - 2 * bar)).toBeCloseTo(ASPECT, 2);
  });

  it('draws no bars when the frame is already wider than the band', () => {
    expect(letterboxBarPx(2400, 900, ASPECT)).toBe(0);
  });
});

describe('mediaFit', () => {
  it('fills a 9:16 frame', () => {
    expect(mediaFit(1080, 1920)).toBe('cover');
  });

  it('shows footage whole in 16:9', () => {
    expect(mediaFit(1920, 1080)).toBe('contain');
  });
});
