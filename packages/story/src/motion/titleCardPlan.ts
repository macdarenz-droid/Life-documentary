/** Timing for the masked word reveal; callers pass `motion.stagger.word` and `motion.duration.title`. */
export type TitleCardTiming = { wordStaggerMs: number; wordDurationMs: number };

export type TitleCardStep = {
  /** Index of the line the word sits on. */
  line: number;
  /** Index of the word within its line. */
  word: number;
  text: string;
  delayMs: number;
  durationMs: number;
};

export type TitleCardPlan = { steps: TitleCardStep[]; totalMs: number };

export function splitWords(line: string): string[] {
  return line.split(/\s+/).filter((w) => w.length > 0);
}

/** Masked line reveal: one word every `wordStaggerMs`, continuing across lines, each over `wordDurationMs`. */
export function titleCardPlan(lines: readonly string[], timing: TitleCardTiming): TitleCardPlan {
  const steps: TitleCardStep[] = [];
  lines.forEach((text, line) => {
    splitWords(text).forEach((w, word) => {
      steps.push({
        line,
        word,
        text: w,
        delayMs: steps.length * timing.wordStaggerMs,
        durationMs: timing.wordDurationMs,
      });
    });
  });
  const last = steps[steps.length - 1];
  return { steps, totalMs: last ? last.delayMs + last.durationMs : 0 };
}

const EPISODE_SEPARATOR = ' · ';

/**
 * The episode title card's two parts: a small label ("Episode 1 · 12–18 October") and the title
 * itself ("The Week It Rained"). A title without an "Episode n · " prefix keeps its full text, and
 * the label is only the subtitle, or absent when there is none.
 */
export function episodeTitleCard(title: { text: string; subtitle?: string | undefined }): {
  label: string | null;
  lines: string[];
} {
  const at = title.text.indexOf(EPISODE_SEPARATOR);
  const prefix = at > 0 ? title.text.slice(0, at) : null;
  const isEpisodePrefix = prefix !== null && /^Episode \d+$/.test(prefix);
  const text = isEpisodePrefix ? title.text.slice(at + EPISODE_SEPARATOR.length) : title.text;
  const labelParts = [isEpisodePrefix ? prefix : null, title.subtitle ?? null].filter(
    (p): p is string => p !== null && p.length > 0,
  );
  return {
    label: labelParts.length > 0 ? labelParts.join(EPISODE_SEPARATOR) : null,
    lines: [text],
  };
}
