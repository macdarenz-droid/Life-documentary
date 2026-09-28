import type { RenderManifestV2 } from '@life/contracts';

export type TimelineResult = { ok: true } | { ok: false; errors: string[] };

const DUCK_RAMP_MS = 300;
const FADE_IN_MS = 1000;
const FADE_OUT_MS = 1500;

/** Total length of the episode, as the manifest carries it. */
export function manifestDurationMs(m: RenderManifestV2): number {
  return m.durationMs;
}

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

/**
 * Music volume at a moment: ducked under every speech unit, faded in at the start and out at the end.
 */
export function musicVolumeAt(ms: number, m: RenderManifestV2): number {
  if (!m.music) return 0;
  const { gain, duckTo } = m.music;

  let ducking = gain;
  for (const { fromMs: start, toMs: end } of m.speech) {
    const distance = ms < start ? start - ms : ms > end ? ms - end : 0;
    if (distance < DUCK_RAMP_MS) {
      ducking = Math.min(ducking, duckTo + ((gain - duckTo) * distance) / DUCK_RAMP_MS);
    }
  }

  const total = manifestDurationMs(m);
  const fadeIn = ms / FADE_IN_MS;
  const fadeOut = (total - ms) / FADE_OUT_MS;
  const envelope = Math.max(0, Math.min(1, fadeIn, fadeOut));

  return Math.min(ducking, gain * envelope);
}
