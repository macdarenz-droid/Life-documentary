import { staticFile } from 'remotion';

/** Manifest sources are URLs or paths relative to the render project's public/ folder. */
export function resolveSrc(src: string): string {
  return src.startsWith('http') ? src : staticFile(src);
}
