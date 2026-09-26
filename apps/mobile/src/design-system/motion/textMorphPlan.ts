import { tokens } from '@life/design';

export type TextMorphPlan = {
  /** Indices in the new text that stay put. */
  keep: number[];
  /** Indices in the old text that leave. */
  exit: number[];
  /** Indices in the new text that arrive. */
  enter: number[];
  /** Start delay per exiting and entering character, in the order of `exit` and `enter`. */
  delays: { exit: number[]; enter: number[] };
};

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

/**
 * Deterministic diff: the longest common prefix and suffix stay; the middle of the old text
 * exits and the middle of the new text enters, one character every `stagger.char`.
 */
export function textMorphPlan(from: string, to: string): TextMorphPlan {
  const a = Array.from(from);
  const b = Array.from(to);
  const max = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

  const exit = range(prefix, a.length - suffix);
  const enter = range(prefix, b.length - suffix);
  const keep = [...range(0, prefix), ...range(b.length - suffix, b.length)];
  const gap = tokens.motion.stagger.char;
  return {
    keep,
    exit,
    enter,
    delays: { exit: exit.map((_, i) => i * gap), enter: enter.map((_, i) => i * gap) },
  };
}
