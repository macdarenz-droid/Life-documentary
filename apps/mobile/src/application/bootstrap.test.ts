import { openLocalDocumentary } from './bootstrap';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';

describe('openLocalDocumentary', () => {
  it('creates one documentary and returns the same one after', async () => {
    const store = await memoryStore();
    const clock = fixedClock('2027-03-15T09:30:00Z');
    const ids = sequentialIds();
    const first = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
    const second = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      title: 'My documentary',
      kind: 'solo',
      timeZone: 'Europe/Berlin',
    });
    expect(first.ownerUserId).not.toBe(first.id);
    expect(await store.driver.all('SELECT id FROM documentaries')).toHaveLength(1);
  });
});
