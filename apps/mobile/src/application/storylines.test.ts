import { words } from '@life/story';
import * as storylines from '../data/repositories/storylines';
import { openLocalDocumentary } from './bootstrap';
import {
  closeStoryline,
  createStoryline,
  removeStoryline,
  renameStoryline,
  reopenStoryline,
} from './storylines';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { todayQuestion } from './todayQuestion';

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  return { store, clock, ids, documentary };
}

describe('storylines', () => {
  it('creates, renames, closes, reopens and removes, bumping updatedAt each time', async () => {
    const { store, clock, ids, documentary } = await setup();
    const created = await createStoryline(store, clock, ids, documentary, '  The new job  ');
    expect(created).toMatchObject({
      title: 'The new job',
      openedAt: '2027-03-15T09:30:00Z',
      updatedAt: '2027-03-15T09:30:00Z',
    });

    clock.set('2027-03-16T09:00:00Z');
    const renamed = await renameStoryline(store, clock, created.id, 'The job');
    expect(renamed).toMatchObject({ title: 'The job', updatedAt: '2027-03-16T09:00:00Z' });

    clock.set('2027-03-17T09:00:00Z');
    const closed = await closeStoryline(store, clock, created.id);
    expect(closed).toMatchObject({
      closedAt: '2027-03-17T09:00:00Z',
      updatedAt: '2027-03-17T09:00:00Z',
    });

    clock.set('2027-03-18T09:00:00Z');
    const reopened = await reopenStoryline(store, clock, created.id);
    expect(reopened.closedAt).toBeUndefined();
    expect(reopened.updatedAt).toBe('2027-03-18T09:00:00Z');

    clock.set('2027-03-19T09:00:00Z');
    const removed = await removeStoryline(store, clock, created.id);
    expect(removed).toMatchObject({
      deletedAt: '2027-03-19T09:00:00Z',
      updatedAt: '2027-03-19T09:00:00Z',
    });
    expect(await storylines.get(store.driver, created.id)).toEqual(removed);
    expect(await storylines.listOpen(store.driver, documentary.id)).toEqual([]);
  });

  it('refuses a second open storyline with the same title, in any case', async () => {
    const { store, clock, ids, documentary } = await setup();
    await createStoryline(store, clock, ids, documentary, 'The new job');
    await expect(createStoryline(store, clock, ids, documentary, 'the NEW job')).rejects.toThrow(
      words.tags.titleTaken,
    );
    const other = await createStoryline(store, clock, ids, documentary, 'Half marathon');
    await expect(renameStoryline(store, clock, other.id, 'The New Job')).rejects.toThrow(
      words.tags.titleTaken,
    );
  });

  it('allows the title of a closed storyline again', async () => {
    const { store, clock, ids, documentary } = await setup();
    const first = await createStoryline(store, clock, ids, documentary, 'The new job');
    clock.set('2027-03-16T09:00:00Z');
    await closeStoryline(store, clock, first.id);
    const second = await createStoryline(store, clock, ids, documentary, 'The new job');
    expect(second.id).not.toBe(first.id);
    // Reopening the first would make two open storylines with one title.
    await expect(reopenStoryline(store, clock, first.id)).rejects.toThrow(words.tags.titleTaken);
  });

  it('refuses an empty title and a 61-character title', async () => {
    const { store, clock, ids, documentary } = await setup();
    await expect(createStoryline(store, clock, ids, documentary, '   ')).rejects.toThrow(
      words.tags.titleEmpty,
    );
    await expect(createStoryline(store, clock, ids, documentary, 'a'.repeat(61))).rejects.toThrow(
      words.tags.titleTooLong,
    );
    expect(
      (await createStoryline(store, clock, ids, documentary, 'a'.repeat(60))).title,
    ).toHaveLength(60);
  });

  it('refuses changes to a removed storyline', async () => {
    const { store, clock, ids, documentary } = await setup();
    const s = await createStoryline(store, clock, ids, documentary, 'The new job');
    await removeStoryline(store, clock, s.id);
    await expect(renameStoryline(store, clock, s.id, 'Other')).rejects.toThrow(
      words.tags.unavailable,
    );
  });

  it('stops asking about a storyline once it is closed', async () => {
    const { store, clock, ids, documentary } = await setup();
    clock.set('2027-03-01T08:00:00Z');
    const job = await createStoryline(store, clock, ids, documentary, 'The new job');
    clock.set('2027-03-14T08:00:00Z');
    await closeStoryline(store, clock, job.id);
    clock.set('2027-03-15T09:30:00Z');
    const q = await todayQuestion(store, documentary, clock, ids);
    expect(q.reason).not.toBe('open_storyline');
    expect(q.storylineId).toBeUndefined();
    expect(q.text).not.toContain('The new job');
  });
});
