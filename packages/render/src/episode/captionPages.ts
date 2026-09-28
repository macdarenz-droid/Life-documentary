import type { RenderManifestV2 } from '@life/contracts';
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';

type SpeechUnit = RenderManifestV2['speech'][number];
export type CaptionWord = { text: string; fromMs: number; toMs: number };
export type CaptionPage = { fromMs: number; toMs: number; words: CaptionWord[] };

/** A page starts once the current one spans more than this (DESIGN §4). */
const COMBINE_WITHIN_MS = 1200;
/** A pause this long starts a new page. */
const BREAK_ON_SILENCE_MS = 800;
/** A page stays up this long after its last word, unless the next page or the unit ends first. */
const HOLD_AFTER_MS = 400;

/**
 * A speech unit's words as caption pages in episode time. Every word after the first carries a
 * leading space, since `createTikTokStyleCaptions` starts a new page only at such a word.
 */
export function captionPages(unit: SpeechUnit): CaptionPage[] {
  if (!unit.captions) return [];
  const captions: Caption[] = unit.words.flatMap((w) => {
    const text = w.text.trim();
    return text === ''
      ? []
      : [{ text, startMs: w.fromMs, endMs: w.toMs, timestampMs: null, confidence: null }];
  });
  captions.forEach((c, i) => {
    if (i > 0) c.text = ` ${c.text}`;
  });
  if (captions.length === 0) return [];

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: COMBINE_WITHIN_MS,
    breakOnSilenceAfterMilliseconds: BREAK_ON_SILENCE_MS,
  });
  return pages.flatMap((page, i) => {
    const last = page.tokens.at(-1);
    if (!last) return [];
    const next = pages[i + 1]?.startMs ?? Number.POSITIVE_INFINITY;
    const toMs = Math.min(next, last.toMs + HOLD_AFTER_MS, unit.toMs);
    return [
      {
        fromMs: page.startMs,
        toMs,
        words: page.tokens.map((t) => ({ text: t.text, fromMs: t.fromMs, toMs: t.toMs })),
      },
    ];
  });
}
