import { describe, expect, it } from 'vitest';
import { EditRequest, EditResult, EpisodeCut } from '../src';

const id = (n: number) => `3b241101-e2bb-4255-8caf-4136c566${String(n).padStart(4, '0')}`;

const cut = EpisodeCut.parse({
  episodeId: id(1),
  planVersion: 3,
  title: 'Rain on the tram',
  narrated: true,
  coldOpen: { momentId: id(2) },
  scenes: [
    {
      heading: 'Tuesday',
      line: 'Tuesday was quiet.',
      shots: [{ momentId: id(3), kind: 'answer' }, { momentId: id(4) }],
    },
  ],
  closing: { momentId: id(3) },
  mood: 'warm',
  editsLeft: 9,
  editsPerDay: 10,
  recut: 'working',
});

describe('edit contracts', () => {
  it('round-trips every EditResult and the EpisodeCut', () => {
    const results = [
      { outcome: 'applied', cut, waitingFor: [id(5)] },
      { outcome: 'stale', cut },
      { outcome: 'refused', reason: 'sceneFull' },
      { outcome: 'limit', cut },
    ];
    for (const result of results) {
      expect(EditResult.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    }
    expect(EpisodeCut.parse(JSON.parse(JSON.stringify(cut)))).toEqual(cut);
  });

  it('refuses a line over 140 characters in an EditRequest', () => {
    const request = (text: string) => ({
      id: id(6),
      appliedToVersion: 2,
      change: { kind: 'swapLine', sceneIndex: 0, with: { kind: 'bridge', text } },
    });
    expect(EditRequest.safeParse(request('a'.repeat(140))).success).toBe(true);
    expect(EditRequest.safeParse(request('a'.repeat(141))).success).toBe(false);
  });
});
