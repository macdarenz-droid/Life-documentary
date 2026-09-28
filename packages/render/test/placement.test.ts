import { describe, expect, it } from 'vitest';
import { captionBottomPx, captionTopPx } from '../src/episode/Captions';
import { lowerThirdBottomPx } from '../src/episode/LowerThird';

describe('lower third and caption placement', () => {
  it.each([
    ['9:16', 1080, 1920],
    ['16:9', 1920, 1080],
  ])('keeps the lower third above a two-line caption box in %s', (_, width, height) => {
    expect(lowerThirdBottomPx(width, height)).toBeGreaterThan(captionTopPx(width, height));
  });

  it('puts the lower third in the lower quarter in 16:9, above the caption band', () => {
    expect(lowerThirdBottomPx(1920, 1080)).toBeLessThanOrEqual(1080 * 0.25);
    expect(captionBottomPx(1920, 1080)).toBeLessThan(lowerThirdBottomPx(1920, 1080));
  });
});
