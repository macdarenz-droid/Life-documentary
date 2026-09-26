import { MASTER_KEY_NAME, loadOrCreateMasterKey } from './fileStore/masterKey';
import { memoryFileIO } from './fileStore/testing/memoryFileIO';
import { memoryKeyStore } from './fileStore/testing/memoryKeyStore';
import { nodeCipher } from './fileStore/testing/nodeCipher';
import { checkDatabase, checkFiles } from './integrity';
import { CorruptRowError, mediaAssets, moments } from './repositories';
import { NOW, asset, freshDb, id, note } from './repositories/testing/rows';

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

describe('checkFiles', () => {
  async function store() {
    const db = await freshDb();
    const io = memoryFileIO();
    const keyStore = memoryKeyStore();
    await loadOrCreateMasterKey(keyStore, nodeCipher);
    const a = { ...asset(10), localPath: 'store/10.enc' };
    await mediaAssets.put(db, a);
    io.files.set('store/10.enc', new Uint8Array([1]));
    return { db, io, keyStore };
  }

  it('is ok on a consistent store', async () => {
    const { db, io, keyStore } = await store();
    expect(await checkFiles({ driver: db, io, keyStore, storeDir: 'store' })).toEqual({
      ok: true,
      problems: [],
    });
  });

  it('reports an asset whose file is missing', async () => {
    const { db, io, keyStore } = await store();
    io.files.delete('store/10.enc');
    expect((await checkFiles({ driver: db, io, keyStore, storeDir: 'store' })).problems).toEqual([
      expect.objectContaining({ kind: 'missingFile', table: 'media_assets', id: id(10) }),
    ]);
  });

  it('reports a file with no asset', async () => {
    const { db, io, keyStore } = await store();
    io.files.set('store/stray.enc', new Uint8Array([2]));
    expect((await checkFiles({ driver: db, io, keyStore, storeDir: 'store' })).problems).toEqual([
      expect.objectContaining({ kind: 'orphanFile', detail: 'store/stray.enc has no asset' }),
    ]);
  });

  it('reports assets without a master key', async () => {
    const { db, io, keyStore } = await store();
    await keyStore.remove(MASTER_KEY_NAME);
    expect((await checkFiles({ driver: db, io, keyStore, storeDir: 'store' })).problems).toEqual([
      expect.objectContaining({ kind: 'missingMasterKey' }),
    ]);
  });
});
