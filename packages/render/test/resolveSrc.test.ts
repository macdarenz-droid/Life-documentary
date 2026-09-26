import { describe, expect, it, vi } from 'vitest';
import { resolveSrc } from '../src/resolveSrc';

vi.mock('remotion', () => ({ staticFile: (path: string) => `/public-root/${path}` }));

describe('resolveSrc', () => {
  it('returns http and https sources unchanged', () => {
    expect(resolveSrc('https://example.com/a.mp4')).toBe('https://example.com/a.mp4');
    expect(resolveSrc('http://example.com/b.jpg')).toBe('http://example.com/b.jpg');
  });

  it('resolves relative sources through staticFile', () => {
    expect(resolveSrc('fixtures/clip.mp4')).toBe('/public-root/fixtures/clip.mp4');
  });
});
