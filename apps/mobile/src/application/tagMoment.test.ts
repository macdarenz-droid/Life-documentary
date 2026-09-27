import { words } from '@life/story';
import * as documentaries from '../data/repositories/documentaries';
import * as moments from '../data/repositories/moments';
import { openLocalDocumentary } from './bootstrap';
import { addCastMember } from './cast';
import { captureMoment } from './captureMoment';
import { createStoryline, removeStoryline } from './storylines';
import { tagMoment } from './tagMoment';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  const moment = await captureMoment(store, clock, ids, {
    kind: 'note',
    text: 'A slow morning.',
    localOnly: false,
  });
  return { store, clock, ids, documentary, moment };
}

describe('tagMoment', () => {
  it("replaces a moment's tags and bumps updatedAt", async () => {
    const { store, clock, ids, documentary, moment } = await setup();
    const job = await createStoryline(store, clock, ids, documentary, 'The new job');
    const run = await createStoryline(store, clock, ids, documentary, 'Half marathon');
    const mara = await addCastMember(store, clock, ids, documentary, 'Mara');
    clock.set('2027-03-15T10:00:00Z');
    await tagMoment(store, clock, moment.id, { storylineIds: [job.id], castIds: [mara.id] });
    clock.set('2027-03-15T11:00:00Z');
    const tagged = await tagMoment(store, clock, moment.id, {
      storylineIds: [run.id],
      castIds: [],
    });
    expect(tagged).toMatchObject({
      storylineIds: [run.id],
      castIds: [],
      updatedAt: '2027-03-15T11:00:00Z',
    });
    expect(await moments.get(store.driver, moment.id)).toMatchObject({
      storylineIds: [run.id],
      castIds: [],
    });
  });

  it('refuses a removed storyline', async () => {
    const { store, clock, ids, documentary, moment } = await setup();
    const job = await createStoryline(store, clock, ids, documentary, 'The new job');
    await removeStoryline(store, clock, job.id);
    await expect(
      tagMoment(store, clock, moment.id, { storylineIds: [job.id], castIds: [] }),
    ).rejects.toThrow(words.tags.unavailable);
  });

  it('refuses a storyline from another documentary', async () => {
    const { store, clock, ids, documentary, moment } = await setup();
    const other = await documentaries.put(store.driver, { ...documentary, id: ids.newId() });
    const elsewhere = await createStoryline(store, clock, ids, other, 'Elsewhere');
    await expect(
      tagMoment(store, clock, moment.id, { storylineIds: [elsewhere.id], castIds: [] }),
    ).rejects.toThrow(words.tags.unavailable);
    expect((await moments.get(store.driver, moment.id))?.storylineIds).toEqual([]);
  });

  it('refuses eleven storylines', async () => {
    const { store, clock, ids, documentary, moment } = await setup();
    const many = [];
    for (let i = 0; i < 11; i += 1) {
      many.push((await createStoryline(store, clock, ids, documentary, `Thread ${i}`)).id);
    }
    await expect(
      tagMoment(store, clock, moment.id, { storylineIds: many, castIds: [] }),
    ).rejects.toThrow(words.tags.tooManyStorylines);
    await expect(
      tagMoment(store, clock, moment.id, { storylineIds: many.slice(0, 10), castIds: [] }),
    ).resolves.toMatchObject({ storylineIds: many.slice(0, 10) });
  });
});
