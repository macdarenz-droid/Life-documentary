import { tokens } from '@life/design';
import { noise3D } from '@remotion/noise';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

/** The grain is drawn at a quarter of the video's resolution and scaled up, like film grain. */
const GRAIN_DOWNSCALE = 4;
/** Noise sampled once per grain pixel: high frequency so it reads as grain, not clouds. */
const NOISE_FREQUENCY = 0.9;
const CHANNEL_MAX = 255;
const GREY_MID = 0.5;
/** Distinct grain frames computed per render; later grain frames cycle through them. */
const GRAIN_CYCLE = 8;
const cache = new Map<string, string>();

/** One grain frame as an image URL, computed once per size and index. */
function grainUrl(w: number, h: number, index: number): string {
  const key = `${w}x${h}:${index}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = noise3D('grain', x * NOISE_FREQUENCY, y * NOISE_FREQUENCY, index);
      const v = Math.round((GREY_MID + n * GREY_MID) * CHANNEL_MAX);
      const i = (y * w + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = CHANNEL_MAX;
    }
  }
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Film grain over the whole episode at `texture.grainOpacity`, a new frame `texture.grainFps` times a second. */
export function Grain({ reducedMotion }: { reducedMotion: boolean }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const grainFrame = reducedMotion ? 0 : Math.floor((frame * tokens.motion.texture.grainFps) / fps);
  const w = Math.ceil(width / GRAIN_DOWNSCALE);
  const h = Math.ceil(height / GRAIN_DOWNSCALE);
  const shown = grainFrame % GRAIN_CYCLE;
  const count = reducedMotion ? 1 : GRAIN_CYCLE;

  // Every grain frame stays mounted so the browser keeps it decoded; only the current one is visible.
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, i) => (
        <AbsoluteFill
          key={i}
          style={{
            opacity: tokens.motion.texture.grainOpacity,
            visibility: i === shown ? 'visible' : 'hidden',
            backgroundImage: `url(${grainUrl(w, h, i)})`,
            backgroundSize: '100% 100%',
          }}
        />
      ))}
    </AbsoluteFill>
  );
}
