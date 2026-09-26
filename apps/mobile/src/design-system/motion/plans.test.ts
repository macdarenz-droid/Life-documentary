import { titleCardPlan } from './titleCardPlan';
import { textMorphPlan } from './textMorphPlan';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('titleCardPlan', () => {
  it('staggers words across lines 60 ms apart and ends one title duration after the last word', () => {
    const plan = titleCardPlan(['The Week', 'It Rained']);
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
    expect(titleCardPlan([])).toEqual({ steps: [], totalMs: 0 });
    expect(titleCardPlan(['  '])).toEqual({ steps: [], totalMs: 0 });
  });
});

describe('textMorphPlan', () => {
  it('"Hold to answer" → "Recording" shares no prefix or suffix: every letter leaves and arrives', () => {
    const plan = textMorphPlan('Hold to answer', 'Recording');
    expect(plan.keep).toEqual([]);
    expect(plan.exit).toEqual(range(14));
    expect(plan.enter).toEqual(range(9));
    expect(plan.delays.exit).toEqual(range(14).map((i) => i * 22));
    expect(plan.delays.enter).toEqual(range(9).map((i) => i * 22));
  });

  it('"Recording" → "Saved" shares no prefix or suffix', () => {
    const plan = textMorphPlan('Recording', 'Saved');
    expect(plan.keep).toEqual([]);
    expect(plan.exit).toEqual(range(9));
    expect(plan.enter).toEqual(range(5));
  });

  it('keeps a shared prefix and suffix and swaps only the middle', () => {
    const plan = textMorphPlan('Saved today', 'Saved tonight');
    // prefix "Saved to", suffix none ("y" vs "t")
    expect(plan.keep).toEqual(range(8));
    expect(plan.exit).toEqual([8, 9, 10]);
    expect(plan.enter).toEqual([8, 9, 10, 11, 12]);
    expect(plan.delays.enter).toEqual([0, 22, 44, 66, 88]);
  });

  it('keeps suffix letters at their new positions', () => {
    const plan = textMorphPlan('Recording', 'Reading');
    // prefix "Re", suffix "ding"
    expect(plan.keep).toEqual([0, 1, 3, 4, 5, 6]);
    expect(plan.exit).toEqual([2, 3, 4]);
    expect(plan.enter).toEqual([2]);
  });

  it('"Saved" → "Saved" has nothing to exit or enter', () => {
    const plan = textMorphPlan('Saved', 'Saved');
    expect(plan.exit).toEqual([]);
    expect(plan.enter).toEqual([]);
    expect(plan.keep).toEqual(range(5));
  });
});
