import { describe, expect, it } from 'vitest';
import { CostLedgerRow, NarrationClip, NarrationLine, TimedWord } from '../src';

const id = (n: number) => `3b241101-e2bb-4255-8caf-4136c566${String(n).padStart(4, '0')}`;
const NOW = '2027-03-15T09:30:00Z';

const clip = {
  episodeId: id(1),
  planVersion: 1,
  index: 0,
  kind: 'bridge',
  sceneIndex: 0,
  text: 'Home again.',
  voiceId: 'narrator-1',
  key: 'u/a/b/narration/c/d.mp3',
  hash: 'a'.repeat(64),
  durationMs: 1350,
  words: [
    { text: 'Home', fromMs: 250, toMs: 650 },
    { text: 'again.', fromMs: 750, toMs: 1350 },
  ],
  kept: true,
  createdAt: NOW,
};

describe('narration', () => {
  it('accepts a line, a word and a clip', () => {
    expect(NarrationLine.safeParse({ index: 3, kind: 'tease', text: 'Next week.' }).success).toBe(
      true,
    );
    expect(TimedWord.safeParse({ text: 'Home', fromMs: 0, toMs: 400 }).success).toBe(true);
    expect(NarrationClip.safeParse(clip).success).toBe(true);
  });
  it('refuses a word that ends before it starts, and 61 words', () => {
    expect(
      NarrationClip.safeParse({ ...clip, words: [{ text: 'Home', fromMs: 650, toMs: 250 }] })
        .success,
    ).toBe(false);
    const word = { text: 'word', fromMs: 0, toMs: 10 };
    expect(NarrationClip.safeParse({ ...clip, words: Array(61).fill(word) }).success).toBe(false);
    expect(NarrationClip.safeParse({ ...clip, words: Array(60).fill(word) }).success).toBe(true);
    expect(NarrationClip.safeParse({ ...clip, words: [] }).success).toBe(false);
  });
  it('lets the ledger count narration characters', () => {
    const row = {
      id: id(2),
      episodeId: id(1),
      step: 'narrate',
      provider: 'elevenlabs',
      unit: 'character',
      units: 120,
      microUsd: 6000,
      at: NOW,
    };
    expect(CostLedgerRow.safeParse(row).success).toBe(true);
  });
});
