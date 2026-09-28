import { blendOver, contrastRatio, tokens } from '@life/design';
import { describe, expect, it } from 'vitest';
import { captionPages } from '../src/episode/captionPages';

type Word = { text: string; fromMs: number; toMs: number };
const unit = (words: Word[], extra: { captions?: boolean; toMs?: number } = {}) => ({
  kind: 'person' as const,
  fromMs: 0,
  toMs: extra.toMs ?? 20_000,
  captions: extra.captions ?? true,
  approximate: false,
  words,
});
/** `n` back-to-back words of `lengthMs`, starting at `fromMs`. */
const run = (n: number, fromMs: number, lengthMs: number, prefix = 'w'): Word[] =>
  Array.from({ length: n }, (_, i) => ({
    text: `${prefix}${i}`,
    fromMs: fromMs + i * lengthMs,
    toMs: fromMs + (i + 1) * lengthMs,
  }));

describe('captionPages', () => {
  it('makes two pages of five from ten 300 ms words', () => {
    const pages = captionPages(unit(run(10, 0, 300)));
    expect(pages.map((p) => p.words.length)).toEqual([5, 5]);
    expect(pages[0]?.words.map((w) => w.text).join('')).toBe('w0 w1 w2 w3 w4');
    expect(pages[1]?.words[0]?.text).toBe('w5');
    expect(pages[0]).toMatchObject({ fromMs: 0, toMs: 1500 });
  });

  it('starts a new page after a 1 s silence', () => {
    const words = [...run(2, 0, 300, 'a'), ...run(2, 1600, 300, 'b')];
    const pages = captionPages(unit(words));
    expect(pages.map((p) => p.words.map((w) => w.text.trim()))).toEqual([
      ['a0', 'a1'],
      ['b0', 'b1'],
    ]);
  });

  it('ends the last page 400 ms after its last word', () => {
    const pages = captionPages(unit(run(3, 1000, 300)));
    expect(pages.at(-1)?.toMs).toBe(1900 + 400);
  });

  it('ends a page no later than its unit', () => {
    const pages = captionPages(unit(run(3, 1000, 300), { toMs: 2000 }));
    expect(pages.at(-1)?.toMs).toBe(2000);
  });

  it('never merges words into one page for lack of spaces', () => {
    const words = run(12, 0, 300).map((w) => ({ ...w, text: ` ${w.text} ` }));
    const pages = captionPages(unit(words));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.words)).toHaveLength(12);
    expect(pages.every((p) => !p.words[0]?.text.startsWith(' '))).toBe(true);
    expect(pages.every((p) => p.words.slice(1).every((w) => w.text.startsWith(' ')))).toBe(true);
  });

  it('gives no pages when captions are off or there are no words', () => {
    expect(captionPages(unit(run(4, 0, 300), { captions: false }))).toEqual([]);
    expect(captionPages(unit([]))).toEqual([]);
  });
});

describe('caption contrast', () => {
  it('keeps both word colours at 4.5:1 or more over white footage under the box', () => {
    const { scrim, text, textSecondary } = tokens.color;
    const box = blendOver(scrim.hex, 0.85, '#FFFFFF');
    const secondary = blendOver(textSecondary.hex, textSecondary.alpha, box);
    expect(contrastRatio(text, box)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(secondary, box)).toBeGreaterThanOrEqual(4.5);
  });
});
