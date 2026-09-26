import { checkDatabase } from './integrity';
import { CorruptRowError, moments } from './repositories';
import { NOW, freshDb, id, note } from './repositories/testing/rows';

describe('checkDatabase', () => {
  it('reports a healthy database as ok', async () => {
    const db = await freshDb();
    await moments.put(db, note(50, NOW));
    expect(await checkDatabase(db)).toEqual({ ok: true, problems: [] });
  });

  it('reports a row that passes CHECK constraints but fails its contract', async () => {
    const db = await freshDb();
    await db.run(
      `INSERT INTO moments (id, documentary_id, author_user_id, captured_at, time_zone, local_day, kind, text, local_only, updated_at)
       VALUES (?, ?, ?, ?, 'Europe/Berlin', '2027-03-15', 'note', ?, 0, ?)`,
      [id(50), id(1), id(2), NOW, 'a'.repeat(600), NOW],
    );
    await expect(moments.get(db, id(50))).rejects.toBeInstanceOf(CorruptRowError);
    const report = await checkDatabase(db);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual([
      expect.objectContaining({ kind: 'corruptRow', table: 'moments', id: id(50) }),
    ]);
  });

  it('reports a moment that points at a missing media asset', async () => {
    const db = await freshDb();
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.run(
      `INSERT INTO moments (id, documentary_id, author_user_id, captured_at, time_zone, local_day, kind, media_asset_id, local_only, updated_at)
       VALUES (?, ?, ?, ?, 'Europe/Berlin', '2027-03-15', 'clip', ?, 0, ?)`,
      [id(50), id(1), id(2), NOW, id(99), NOW],
    );
    const report = await checkDatabase(db);
    expect(report.problems).toContainEqual(
      expect.objectContaining({ kind: 'foreignKey', table: 'moments', id: id(50) }),
    );
  });
});
