import type { RenderManifestV1 } from '@life/contracts';

export type TimelineResult = { ok: true } | { ok: false; errors: string[] };

const DUCK_RAMP_MS = 300;
const FADE_IN_MS = 1000;
const FADE_OUT_MS = 1500;

/** Total length: title card, every shot, closing card. */
export function manifestDurationMs(m: RenderManifestV1): number {
  return (
    m.title.durationMs + m.shots.reduce((sum, s) => sum + s.durationMs, 0) + m.closing.durationMs
  );
}

/** Start of each shot; the first shot starts when the title card ends. */
export function shotStartsMs(m: RenderManifestV1): number[] {
  const starts: number[] = [];
  let at = m.title.durationMs;
  for (const shot of m.shots) {
    starts.push(at);
    at += shot.durationMs;
  }
  return starts;
}

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

type Interval = { start: number; end: number };

/** Index pairs of overlapping half-open intervals [start, end); touching ones do not overlap. */
function overlapping(items: Interval[]): [number, number][] {
  const pairs: [number, number][] = [];
  items.forEach((a, i) => {
    items.forEach((b, j) => {
      const bothValid = a.end > a.start && b.end > b.start;
      if (j > i && bothValid && a.start < b.end && b.start < a.end) pairs.push([i, j]);
    });
  });
  return pairs;
}

export function validateTimeline(m: RenderManifestV1): TimelineResult {
  const total = manifestDurationMs(m);
  const errors: string[] = [];

  const narration = m.narration.map((n) => ({ start: n.atMs, end: n.atMs + n.durationMs }));
  const captions = m.captions.map((c) => ({ start: c.fromMs, end: c.toMs }));

  m.captions.forEach((c, i) => {
    if (c.toMs <= c.fromMs) errors.push(`caption ${i} ends at or before it starts`);
    if (c.toMs > total) errors.push(`caption ${i} ends after the episode (${total} ms)`);
  });
  narration.forEach((n, i) => {
    if (n.end > total) errors.push(`narration ${i} ends after the episode (${total} ms)`);
  });
  m.lowerThirds.forEach((l, i) => {
    if (l.atMs + l.durationMs > total) {
      errors.push(`lower-third ${i} ends after the episode (${total} ms)`);
    }
  });
  for (const [i, j] of overlapping(narration))
    errors.push(`narration ${i} overlaps narration ${j}`);
  for (const [i, j] of overlapping(captions)) {
    errors.push(`caption ${i} overlaps caption ${j}`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Music volume at a moment: ducked under narration, faded in at the start and out at the end. */
export function musicVolumeAt(ms: number, m: RenderManifestV1): number {
  if (!m.music) return 0;
  const { gain, duckTo } = m.music;

  let ducking = gain;
  for (const n of m.narration) {
    const start = n.atMs;
    const end = n.atMs + n.durationMs;
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
