import { castMembers, moments } from './index';
import { NOW, cast, freshDb, id, note } from './testing/rows';

describe('moment summaries for the question engine', () => {
  async function seeded() {
    const db = await freshDb();
    await castMembers.put(db, cast(30, 'Maya'));
    await castMembers.put(db, cast(31, 'Ben'));
    await castMembers.put(db, { ...cast(32, 'Gone'), deletedAt: NOW });
    await moments.put(
      db,
      note(50, '2027-03-10T10:00:00Z', { placeName: 'The harbour', castIds: [id(30), id(32)] }),
    );
    await moments.put(
      db,
      note(51, '2027-03-10T12:00:00Z', { placeName: 'The harbour', castIds: [id(31)] }),
    );
    await moments.put(db, note(52, '2027-03-11T12:00:00Z', { placeName: 'Old mill' }));
    await moments.put(
      db,
      note(53, '2027-03-11T13:00:00Z', { deletedAt: NOW, placeName: 'Hidden' }),
    );
    await moments.put(db, note(54, '2027-03-01T12:00:00Z', { placeName: 'Station' }));
    return db;
  }

  it('summarises each local day with moments', async () => {
    const db = await seeded();
    expect(await moments.recentDaySummaries(db, id(1), '2027-03-10', '2027-03-12')).toEqual([
      {
        date: '2027-03-10',
        momentCount: 2,
        placeNames: ['The harbour'],
        castNames: ['Ben', 'Maya'],
      },
      { date: '2027-03-11', momentCount: 1, placeNames: ['Old mill'], castNames: [] },
    ]);
  });

  it('lists distinct places before a day', async () => {
    const db = await seeded();
    expect(await moments.placesBefore(db, id(1), '2027-03-11')).toEqual(['Station', 'The harbour']);
  });

  it('counts the moments of one day, deleted excluded', async () => {
    const db = await seeded();
    expect(await moments.momentCountOn(db, id(1), '2027-03-11')).toBe(1);
    expect(await moments.momentCountOn(db, id(1), '2027-03-12')).toBe(0);
  });
});
