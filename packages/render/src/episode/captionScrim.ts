type CaptionSpan = { fromMs: number; toMs: number };

/** Groups touching or overlapping captions into runs, each spanning its first `fromMs` to its last `toMs`. */
function captionRuns(captions: readonly CaptionSpan[]): CaptionSpan[] {
  const sorted = [...captions].sort((a, b) => a.fromMs - b.fromMs);
  const runs: CaptionSpan[] = [];
  for (const c of sorted) {
    const last = runs[runs.length - 1];
    if (last && c.fromMs <= last.toMs) last.toMs = Math.max(last.toMs, c.toMs);
    else runs.push({ fromMs: c.fromMs, toMs: c.toMs });
  }
  return runs;
}

/**
 * Opacity of the caption scrim at `ms`: for each run of touching captions it rises linearly over
 * `fadeMs` to 1 at the run's first caption, stays 1 through the run, and falls over `fadeMs` after
 * its last caption ends; 0 elsewhere.
 */
export function captionScrimOpacity(
  ms: number,
  captions: readonly CaptionSpan[],
  fadeMs: number,
): number {
  let opacity = 0;
  for (const run of captionRuns(captions)) {
    let o = 0;
    if (ms >= run.fromMs && ms <= run.toMs) o = 1;
    else if (ms < run.fromMs && ms > run.fromMs - fadeMs) o = (ms - (run.fromMs - fadeMs)) / fadeMs;
    else if (ms > run.toMs && ms < run.toMs + fadeMs) o = 1 - (ms - run.toMs) / fadeMs;
    opacity = Math.max(opacity, o);
  }
  return opacity;
}
