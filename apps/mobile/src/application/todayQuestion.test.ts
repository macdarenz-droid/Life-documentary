import { Question } from '@life/contracts';
import { pickQuestion, questionTemplates } from '@life/story';
import * as moments from '../data/repositories/moments';
import * as storylines from '../data/repositories/storylines';
import { openLocalDocumentary } from './bootstrap';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { todayQuestion } from './todayQuestion';

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  return { store, clock, ids, documentary };
}

describe('todayQuestion', () => {
  it("stores and returns the engine's pick for today", async () => {
    const { store, clock, ids, documentary } = await setup();
    const q = await todayQuestion(store, documentary, clock, ids);
    expect(Question.safeParse(q).success).toBe(true);
    const expected = pickQuestion({
      today: '2027-03-15',
      seed: documentary.id,
      templates: questionTemplates,
      openStorylines: [],
      recentDays: [],
      placesBefore: [],
      momentsOneYearAgo: 0,
      history: [],
    });
    expect(q).toMatchObject({
      askedOn: '2027-03-15',
      templateId: expected.templateId,
      text: expected.text,
    });
  });

  it('returns the same row on the same day and a new one the next day', async () => {
    const { store, clock, ids, documentary } = await setup();
    const first = await todayQuestion(store, documentary, clock, ids);
    expect((await todayQuestion(store, documentary, clock, ids)).id).toBe(first.id);
    clock.set('2027-03-16T09:30:00Z');
    const next = await todayQuestion(store, documentary, clock, ids);
    expect(next.id).not.toBe(first.id);
    expect(next.askedOn).toBe('2027-03-16');
  });

  it('does not ask about an open storyline two days in a row', async () => {
    const { store, clock, ids, documentary } = await setup();
    await storylines.put(store.driver, {
      id: ids.newId(),
      documentaryId: documentary.id,
      title: 'The new job',
      openedAt: '2027-03-01T08:00:00Z',
      updatedAt: '2027-03-01T08:00:00Z',
    });
    // A note on each of the days before, so the quiet-days rule does not win first.
    for (const day of ['2027-03-12', '2027-03-13', '2027-03-14', '2027-03-15']) {
      await moments.put(store.driver, {
        id: ids.newId(),
        documentaryId: documentary.id,
        authorUserId: documentary.ownerUserId,
        capturedAt: `${day}T12:00:00Z`,
        timeZone: 'Europe/Berlin',
        kind: 'note',
        text: 'A slow morning.',
        localOnly: false,
        storylineIds: [],
        castIds: [],
        updatedAt: `${day}T12:00:00Z`,
      });
    }
    const first = await todayQuestion(store, documentary, clock, ids);
    expect(first.reason).toBe('open_storyline');
    expect(first.text).toContain('The new job');
    clock.set('2027-03-16T09:30:00Z');
    expect((await todayQuestion(store, documentary, clock, ids)).reason).not.toBe('open_storyline');
  });
});
