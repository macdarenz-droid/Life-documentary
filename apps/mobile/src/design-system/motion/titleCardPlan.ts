import { tokens } from '@life/design';

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

/** Masked line reveal: one word every `stagger.word`, continuing across lines, each over `duration.title`. */
export function titleCardPlan(lines: readonly string[]): TitleCardPlan {
  const { title } = tokens.motion.duration;
  const gap = tokens.motion.stagger.word;
  const steps: TitleCardStep[] = [];
  lines.forEach((text, line) => {
    splitWords(text).forEach((w, word) => {
      steps.push({ line, word, text: w, delayMs: steps.length * gap, durationMs: title });
    });
  });
  const last = steps[steps.length - 1];
  return { steps, totalMs: last ? last.delayMs + last.durationMs : 0 };
}
