import { tokens } from '@life/design';
import { noise3D } from '@remotion/noise';
import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

/** The grain is drawn at a quarter of the video's resolution and scaled up, like film grain. */
const GRAIN_DOWNSCALE = 4;
/** Noise sampled once per grain pixel: high frequency so it reads as grain, not clouds. */
const NOISE_FREQUENCY = 0.9;
const CHANNEL_MAX = 255;
const GREY_MID = 0.5;

/** Film grain over the whole episode at `texture.grainOpacity`, a new frame `texture.grainFps` times a second. */
export function Grain({ reducedMotion }: { reducedMotion: boolean }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.ceil(width / GRAIN_DOWNSCALE);
  const h = Math.ceil(height / GRAIN_DOWNSCALE);
  const grainFrame = reducedMotion ? 0 : Math.floor((frame * tokens.motion.texture.grainFps) / fps);

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise3D('grain', x * NOISE_FREQUENCY, y * NOISE_FREQUENCY, grainFrame);
        const v = Math.round((GREY_MID + n * GREY_MID) * CHANNEL_MAX);
        const i = (y * w + x) * 4;
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = CHANNEL_MAX;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [grainFrame, w, h]);

  return (
    <AbsoluteFill style={{ opacity: tokens.motion.texture.grainOpacity, pointerEvents: 'none' }}>
      <canvas ref={ref} width={w} height={h} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
}
