// The pure parts of narration (P14, D40): which lines are spoken, when a line may be spoken, word timings
// from a synthesis alignment or an answer's transcript, and the 25% cap on measured lengths.
import {
  TimedWord,
  type Derived,
  type EpisodePlanV1,
  type NarrationLine,
  type WeekBriefV1,
} from '@life/contracts';
import { narratorShare } from '../planValidation/validatePlan';

/** The bridges in scene order, then the tease, indexed from 0; none for a plan without narration. */
export function narrationLines(plan: EpisodePlanV1): NarrationLine[] {
  const lines: Omit<NarrationLine, 'index'>[] = [
    ...plan.scenes.flatMap((scene, sceneIndex) =>
      scene.narratorBridge
        ? [{ kind: 'bridge' as const, sceneIndex, text: scene.narratorBridge.text }]
        : [],
    ),
    ...(plan.tease ? [{ kind: 'tease' as const, text: plan.tease.text }] : []),
  ];
  return lines.map((line, index) => ({ index, ...line }));
}

const DIGIT = /\p{Nd}/u;

/** Whether a line may be sent to the voice: not empty, and no digit (the voice reads digits badly). */
export function speakable(text: string): boolean {
  return text.trim() !== '' && !DIGIT.test(text);
}

/** A character alignment: one start and end time in seconds per character. */
export type Alignment = {
  characters: readonly string[];
  startSeconds: readonly number[];
  endSeconds: readonly number[];
};

/** Keeps the words that parse (text 1..60, ending after they start). */
function parsed(words: { text: string; fromMs: number; toMs: number }[]): TimedWord[] {
  return words.flatMap((w) => {
    const result = TimedWord.safeParse(w);
    return result.success ? [result.data] : [];
  });
}

/**
 * The words of a line from its character alignment, each from its first character's start to its last
 * character's end, in whole ms. `null` when the alignment is missing, empty, of unequal lengths, does
 * not spell the text, or leaves no word with a length.
 */
export function lineWords(
  text: string,
  alignment: Alignment | null | undefined,
): TimedWord[] | null {
  if (!alignment) return null;
  const { characters, startSeconds, endSeconds } = alignment;
  const n = characters.length;
  if (n === 0 || startSeconds.length !== n || endSeconds.length !== n) return null;
  if (characters.join('') !== text) return null;

  const words: { text: string; fromMs: number; toMs: number }[] = [];
  let first = -1;
  for (let i = 0; i <= n; i += 1) {
    const isSpace = i === n || /\s/.test(characters[i] ?? ' ');
    if (!isSpace && first < 0) first = i;
    if (isSpace && first >= 0) {
      words.push({
        text: characters.slice(first, i).join(''),
        fromMs: Math.round((startSeconds[first] ?? 0) * 1000),
        toMs: Math.round((endSeconds[i - 1] ?? 0) * 1000),
      });
      first = -1;
    }
  }
  const kept = parsed(words);
  return kept.length > 0 ? kept : null;
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** `words` spread evenly from `fromMs` to `toMs`. */
function spread(words: string[], fromMs: number, toMs: number) {
  const step = (toMs - fromMs) / words.length;
  return words.map((text, i) => ({
    text,
    fromMs: Math.round(fromMs + step * i),
    toMs: Math.round(fromMs + step * (i + 1)),
  }));
}

/**
 * An answer's words and when they are heard, from its transcript: the segments' own word timings;
 * else each segment's words spread over that segment; else the transcript's words spread over the
 * answer. The last two are approximate (the words are real, their timing is estimated). Every time is
 * clamped to the answer's length; no transcript gives no words.
 */
export function answerWords(
  derived: Pick<Derived, 'transcript' | 'segments'> | undefined,
  durationMs: number,
): { words: TimedWord[]; approximate: boolean } {
  const transcript = derived?.transcript;
  if (transcript === undefined || transcript.trim() === '')
    return { words: [], approximate: false };

  let approximate = false;
  let raw: { text: string; fromMs: number; toMs: number }[];
  const segments = derived?.segments ?? [];
  if (segments.length > 0) {
    raw = segments.flatMap((segment) => {
      if (segment.words && segment.words.length > 0) {
        return segment.words.map((w) => ({ text: w.text, fromMs: w.startMs, toMs: w.endMs }));
      }
      approximate = true;
      return spread(wordsOf(segment.text), segment.startMs, segment.endMs);
    });
  } else {
    approximate = true;
    raw = spread(wordsOf(transcript), 0, durationMs);
  }
  const clamp = (ms: number) => Math.min(Math.max(ms, 0), durationMs);
  const words = parsed(
    raw.map((w) => ({ text: w.text.trim(), fromMs: clamp(w.fromMs), toMs: clamp(w.toMs) })),
  );
  return { words, approximate };
}

/**
 * The indices of the lines to keep so the narrator stays at most a quarter of all spoken time, measured
 * with the real clip lengths. Lines without a clip are not kept. The tease goes first, then bridges from
 * the last scene backwards.
 */
export function fitNarration(
  lines: readonly NarrationLine[],
  clipMs: ReadonlyMap<number, number>,
  plan: EpisodePlanV1,
  brief: WeekBriefV1,
): number[] {
  const share = narratorShare(plan, brief);
  const personMs = share.spokenMs - share.narratorMs;
  const kept = lines.filter((line) => clipMs.has(line.index));
  const narratorMs = () => kept.reduce((sum, line) => sum + (clipMs.get(line.index) ?? 0), 0);

  while (kept.length > 0 && narratorMs() * 4 > narratorMs() + personMs) {
    const tease = kept.findIndex((line) => line.kind === 'tease');
    if (tease >= 0) {
      kept.splice(tease, 1);
      continue;
    }
    let last = 0;
    kept.forEach((line, i) => {
      if ((line.sceneIndex ?? -1) >= (kept[last]?.sceneIndex ?? -1)) last = i;
    });
    kept.splice(last, 1);
  }
  return kept.map((line) => line.index);
}
