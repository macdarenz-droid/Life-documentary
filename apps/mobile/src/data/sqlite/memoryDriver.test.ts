import { openMemoryDriver } from './testing/memoryDriver';

describe('memory driver', () => {
  it('turns foreign keys on', async () => {
    const db = await openMemoryDriver();
    expect(await db.first<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
      foreign_keys: 1,
    });
  });

  it('leaves no row behind when a transaction throws', async () => {
    const db = await openMemoryDriver();
    await db.exec('CREATE TABLE t (v INTEGER)');
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await db.all('SELECT v FROM t')).toEqual([]);
  });

  it('commits a nested transaction with the outer one', async () => {
    const db = await openMemoryDriver();
    await db.exec('CREATE TABLE t (v INTEGER)');
    const result = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
      return tx.transaction(async (inner) => {
        await inner.run('INSERT INTO t (v) VALUES (?)', [2]);
        return 'done';
      });
    });
    expect(result).toBe('done');
    expect(await db.all('SELECT v FROM t ORDER BY v')).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it('rolls back the nested work when the outer transaction throws', async () => {
    const db = await openMemoryDriver();
    await db.exec('CREATE TABLE t (v INTEGER)');
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.run('INSERT INTO t (v) VALUES (?)', [2]);
        });
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await db.all('SELECT v FROM t')).toEqual([]);
  });
});
