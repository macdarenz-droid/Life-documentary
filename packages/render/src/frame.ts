/** How footage fills the frame: cover in 9:16, whole on the background colour in 16:9. */
export type MediaFit = 'cover' | 'contain';

export function mediaFit(width: number, height: number): MediaFit {
  return height > width ? 'cover' : 'contain';
}

/** Portrait bars are 10% of the height each, so a talking person is not cut to a strip. */
const PORTRAIT_BAR_SHARE = 0.1;

/**
 * Height in px of each letterbox bar on the cold open: 10% of the height in 9:16, and in 16:9 what is
 * left above and below a band of `aspect` (2.39:1).
 */
export function letterboxBarPx(width: number, height: number, aspect: number): number {
  if (height > width) return Math.round(height * PORTRAIT_BAR_SHARE);
  return Math.max(0, Math.round((height - width / aspect) / 2));
}
