import { words } from '@life/story';
import * as castMembers from '../data/repositories/castMembers';
import { openLocalDocumentary } from './bootstrap';
import { addCastMember, removeCastMember, renameCastMember, setRelation } from './cast';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  return { store, clock, ids, documentary };
}

describe('cast', () => {
  it('adds, renames, sets and clears a relation and removes, bumping updatedAt', async () => {
    const { store, clock, ids, documentary } = await setup();
    const added = await addCastMember(store, clock, ids, documentary, '  Mara ');
    expect(added).toMatchObject({ name: 'Mara', updatedAt: '2027-03-15T09:30:00Z' });
    expect(added.relation).toBeUndefined();

    clock.set('2027-03-16T09:00:00Z');
    expect(await renameCastMember(store, clock, added.id, 'Mara K')).toMatchObject({
      name: 'Mara K',
      updatedAt: '2027-03-16T09:00:00Z',
    });

    clock.set('2027-03-17T09:00:00Z');
    expect(await setRelation(store, clock, added.id, ' sister ')).toMatchObject({
      relation: 'sister',
      updatedAt: '2027-03-17T09:00:00Z',
    });

    clock.set('2027-03-18T09:00:00Z');
    const cleared = await setRelation(store, clock, added.id, null);
    expect(cleared.relation).toBeUndefined();
    expect(cleared.updatedAt).toBe('2027-03-18T09:00:00Z');

    clock.set('2027-03-19T09:00:00Z');
    const removed = await removeCastMember(store, clock, added.id);
    expect(removed).toMatchObject({
      deletedAt: '2027-03-19T09:00:00Z',
      updatedAt: '2027-03-19T09:00:00Z',
    });
    expect(await castMembers.list(store.driver, documentary.id)).toEqual([]);
  });

  it('keeps two people with the same name and different relations', async () => {
    const { store, clock, ids, documentary } = await setup();
    await addCastMember(store, clock, ids, documentary, 'Sam', 'brother');
    await addCastMember(store, clock, ids, documentary, 'Sam', 'colleague');
    const people = await castMembers.list(store.driver, documentary.id);
    expect(people.map((p) => [p.name, p.relation]).sort()).toEqual([
      ['Sam', 'brother'],
      ['Sam', 'colleague'],
    ]);
  });

  it('refuses an empty or 41-character name and a 41-character relation', async () => {
    const { store, clock, ids, documentary } = await setup();
    await expect(addCastMember(store, clock, ids, documentary, ' ')).rejects.toThrow(
      words.tags.nameInvalid,
    );
    await expect(addCastMember(store, clock, ids, documentary, 'n'.repeat(41))).rejects.toThrow(
      words.tags.nameInvalid,
    );
    await expect(
      addCastMember(store, clock, ids, documentary, 'Sam', 'r'.repeat(41)),
    ).rejects.toThrow(words.tags.relationInvalid);
    expect(await castMembers.list(store.driver, documentary.id)).toEqual([]);
  });
});
