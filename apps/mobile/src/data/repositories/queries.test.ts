import { ConflictError, moments, questions, storylines, uploadJobs, mediaAssets } from './index';
import { NOW, asset, freshDb, id, note, question, storyline, uploadJob } from './testing/rows';

describe('moments.listByDays', () => {
  it('lists a moment on its local day', async () => {
    const db = await freshDb();
    await moments.put(db, note(50, '2026-10-24T23:30:00Z', { timeZone: 'Europe/Dublin' }));
    expect(await moments.listByDays(db, id(1), '2026-10-24', '2026-10-24')).toEqual([]);
    expect(
      (await moments.listByDays(db, id(1), '2026-10-25', '2026-10-25')).map((m) => m.id),
    ).toEqual([id(50)]);
  });

  it('orders by capture time and leaves deleted moments out unless asked', async () => {
    const db = await freshDb();
    await moments.put(db, note(51, '2027-03-15T12:00:00Z'));
    await moments.put(db, note(50, '2027-03-15T08:00:00Z'));
    await moments.put(db, note(52, '2027-03-16T08:00:00Z'));
    await moments.softDelete(db, id(52), NOW);
    const listed = await moments.listByDays(db, id(1), '2027-03-15', '2027-03-16');
    expect(listed.map((m) => m.id)).toEqual([id(50), id(51)]);
    const all = await moments.listByDays(db, id(1), '2027-03-15', '2027-03-16', {
      includeDeleted: true,
    });
    expect(all.map((m) => m.id)).toEqual([id(50), id(51), id(52)]);
    expect(all[2]?.deletedAt).toBe(NOW);
  });
});

describe('questions', () => {
  it('refuses a second question for the same day', async () => {
    const db = await freshDb();
    await questions.put(db, question(40, '2027-03-15'));
    await expect(questions.put(db, question(41, '2027-03-15'))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('lists the history in askedOn order and finds the day', async () => {
    const db = await freshDb();
    await questions.put(db, question(42, '2027-03-17'));
    await questions.put(db, question(40, '2027-03-15'));
    await questions.put(db, question(41, '2027-03-16'));
    expect((await questions.listSince(db, id(1), '2027-03-16')).map((q) => q.askedOn)).toEqual([
      '2027-03-16',
      '2027-03-17',
    ]);
    expect((await questions.getForDay(db, id(1), '2027-03-15'))?.id).toBe(id(40));
  });

  it('marks a question answered by a moment', async () => {
    const db = await freshDb();
    await questions.put(db, question(40, '2027-03-15'));
    await moments.put(db, note(50, NOW));
    await questions.markAnswered(db, id(40), id(50));
    expect((await questions.get(db, id(40)))?.answeredByMomentId).toBe(id(50));
  });
});

describe('storylines.listOpen', () => {
  it('leaves out closed and deleted storylines', async () => {
    const db = await freshDb();
    await storylines.put(db, storyline(21, { openedAt: '2027-03-02T00:00:00Z' }));
    await storylines.put(db, storyline(20, { openedAt: '2027-03-01T00:00:00Z' }));
    await storylines.put(db, storyline(22, { closedAt: '2027-04-01T00:00:00Z' }));
    await storylines.put(db, storyline(23, { deletedAt: NOW }));
    expect((await storylines.listOpen(db, id(1))).map((s) => s.id)).toEqual([id(20), id(21)]);
  });
});

describe('uploadJobs.listDue', () => {
  it('returns pending or failed jobs that are due, oldest first', async () => {
    const db = await freshDb();
    for (const n of [10, 11, 12, 13, 14]) await mediaAssets.put(db, asset(n));
    await uploadJobs.put(db, uploadJob(id(10), { updatedAt: '2027-03-15T09:00:00Z' }));
    await uploadJobs.put(
      db,
      uploadJob(id(11), {
        state: 'failed',
        nextAttemptAt: '2027-03-15T09:29:00Z',
        updatedAt: '2027-03-15T08:00:00Z',
      }),
    );
    await uploadJobs.put(
      db,
      uploadJob(id(12), { state: 'failed', nextAttemptAt: '2027-03-15T10:00:00Z' }),
    );
    await uploadJobs.put(db, uploadJob(id(13), { state: 'uploading' }));
    await uploadJobs.put(db, uploadJob(id(14), { state: 'done' }));
    expect((await uploadJobs.listDue(db, NOW, 10)).map((j) => j.assetId)).toEqual([id(11), id(10)]);
    expect((await uploadJobs.listDue(db, NOW, 1)).map((j) => j.assetId)).toEqual([id(11)]);
  });
});

describe('moments.daysBefore and listByStoryline', () => {
  it('lists distinct live days, newest first, strictly before a day, up to a limit', async () => {
    const db = await freshDb();
    await moments.put(db, note(50, '2027-03-13T08:00:00Z'));
    await moments.put(db, note(51, '2027-03-14T08:00:00Z'));
    await moments.put(db, note(52, '2027-03-14T12:00:00Z'));
    await moments.put(db, note(53, '2027-03-15T08:00:00Z'));
    await moments.put(db, note(54, '2027-03-16T08:00:00Z'));
    await moments.softDelete(db, id(54), NOW);
    expect(await moments.daysBefore(db, id(1), undefined, 10)).toEqual([
      '2027-03-15',
      '2027-03-14',
      '2027-03-13',
    ]);
    expect(await moments.daysBefore(db, id(1), '2027-03-15', 1)).toEqual(['2027-03-14']);
  });

  it("lists a storyline's live moments newest first", async () => {
    const db = await freshDb();
    await storylines.put(db, storyline(30));
    await moments.put(db, note(50, '2027-03-13T08:00:00Z', { storylineIds: [id(30)] }));
    await moments.put(db, note(51, '2027-03-15T08:00:00Z', { storylineIds: [id(30)] }));
    await moments.put(db, note(52, '2027-03-14T08:00:00Z'));
    await moments.put(db, note(53, '2027-03-16T08:00:00Z', { storylineIds: [id(30)] }));
    await moments.softDelete(db, id(53), NOW);
    expect((await moments.listByStoryline(db, id(1), id(30))).map((m) => m.id)).toEqual([
      id(51),
      id(50),
    ]);
  });
});

describe('uploadJobs.remove and questions.clearAnswer', () => {
  it('removes a job with its parts, and is quiet when there is none', async () => {
    const db = await freshDb();
    await mediaAssets.put(db, asset(10));
    await uploadJobs.put(db, uploadJob(id(10), { parts: [{ partNumber: 1, etag: 'e1' }] }));
    await uploadJobs.remove(db, id(10));
    expect(await uploadJobs.get(db, id(10))).toBeUndefined();
    expect(await db.all('SELECT * FROM upload_job_parts')).toEqual([]);
    await expect(uploadJobs.remove(db, id(10))).resolves.toBeUndefined();
  });

  it("clears the answer only when it is the given moment's", async () => {
    const db = await freshDb();
    await questions.put(db, question(40, '2027-03-15'));
    await moments.put(db, note(50, NOW));
    await questions.markAnswered(db, id(40), id(50));
    await questions.clearAnswer(db, id(40), id(51));
    expect((await questions.get(db, id(40)))?.answeredByMomentId).toBe(id(50));
    await questions.clearAnswer(db, id(40), id(50));
    expect((await questions.get(db, id(40)))?.answeredByMomentId).toBeUndefined();
  });
});
