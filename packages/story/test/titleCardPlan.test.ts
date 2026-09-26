import { describe, expect, it } from 'vitest';
import { episodeTitleCard, titleCardPlan } from '../src';

const timing = { wordStaggerMs: 60, wordDurationMs: 900 };

describe('titleCardPlan', () => {
  it('staggers words across lines 60 ms apart and ends one title duration after the last word', () => {
    const plan = titleCardPlan(['The Week', 'It Rained'], timing);
    expect(
      plan.steps.map(({ line, word, text, delayMs, durationMs }) => [
        line,
        word,
        text,
        delayMs,
        durationMs,
      ]),
    ).toEqual([
      [0, 0, 'The', 0, 900],
      [0, 1, 'Week', 60, 900],
      [1, 0, 'It', 120, 900],
      [1, 1, 'Rained', 180, 900],
    ]);
    expect(plan.totalMs).toBe(180 + 900);
  });

  it('has nothing to play for no words', () => {
    expect(titleCardPlan([], timing)).toEqual({ steps: [], totalMs: 0 });
    expect(titleCardPlan(['  '], timing)).toEqual({ steps: [], totalMs: 0 });
  });
});

describe('episodeTitleCard', () => {
  it('moves the episode number into the label next to the dates', () => {
    expect(
      episodeTitleCard({ text: 'Episode 1 · The Week It Rained', subtitle: '12–18 October' }),
    ).toEqual({ label: 'Episode 1 · 12–18 October', lines: ['The Week It Rained'] });
  });

  it('keeps a title without an episode prefix whole', () => {
    expect(episodeTitleCard({ text: 'Rain · Again', subtitle: '12–18 October' })).toEqual({
      label: '12–18 October',
      lines: ['Rain · Again'],
    });
  });

  it('has no label when there is neither an episode number nor a subtitle', () => {
    expect(episodeTitleCard({ text: 'The Week It Rained' })).toEqual({
      label: null,
      lines: ['The Week It Rained'],
    });
  });
});
