import {
  CastMember,
  Documentary,
  Episode,
  MediaAsset,
  Moment,
  Question,
  Storyline,
  UploadJob,
} from '@life/contracts';
import {
  castMembers,
  documentaries,
  episodes,
  mediaAssets,
  moments,
  questions,
  storylines,
  uploadJobs,
} from './index';
import {
  NOW,
  note,
  asset,
  cast,
  documentary,
  episode,
  freshDb,
  id,
  question,
  storyline,
  uploadJob,
} from './testing/rows';

describe('round trip: get after put equals the parsed contract', () => {
  it('documentary', async () => {
    const db = await freshDb();
    expect(await documentaries.get(db, documentary.id)).toEqual(Documentary.parse(documentary));
  });

  it('media asset', async () => {
    const db = await freshDb();
    const a = asset(10);
    await mediaAssets.put(db, a);
    expect(await mediaAssets.get(db, a.id)).toEqual(MediaAsset.parse(a));
  });

  it('storyline and cast member', async () => {
    const db = await freshDb();
    const s = storyline(20, { closedAt: '2027-04-01T00:00:00Z', summary: 'Moving in.' });
    const c = { ...cast(30, 'Maya'), relation: 'sister' };
    await storylines.put(db, s);
    await castMembers.put(db, c);
    expect(await storylines.get(db, s.id)).toEqual(Storyline.parse(s));
    expect(await castMembers.get(db, c.id)).toEqual(CastMember.parse(c));
  });

  it('question', async () => {
    const db = await freshDb();
    await storylines.put(db, storyline(20));
    const q = question(40, '2027-03-15', { storylineId: id(20), reason: 'open_storyline' });
    await questions.put(db, q);
    expect(await questions.get(db, q.id)).toEqual(Question.parse(q));
  });

  it('moment with 3 storylines and 2 cast members', async () => {
    const db = await freshDb();
    for (const n of [20, 21, 22]) await storylines.put(db, storyline(n));
    await castMembers.put(db, cast(30, 'Maya'));
    await castMembers.put(db, cast(31, 'Ben'));
    await mediaAssets.put(db, asset(10));
    await questions.put(db, question(40, '2027-03-15'));
    const m = Moment.parse({
      id: id(50),
      documentaryId: id(1),
      authorUserId: id(2),
      capturedAt: NOW,
      timeZone: 'Europe/Berlin',
      kind: 'answer',
      questionId: id(40),
      mediaAssetId: id(10),
      mood: 'tender',
      placeName: 'The harbour',
      localOnly: true,
      storylineIds: [id(22), id(20), id(21)],
      castIds: [id(31), id(30)],
      updatedAt: NOW,
    });
    await moments.put(db, m);
    expect(await moments.get(db, m.id)).toEqual(Moment.parse(m));
  });

  it('episode', async () => {
    const db = await freshDb();
    const e = { ...episode(60, 3), mp4Key: 'e/3.mp4', durationMs: 120_000, deliveredAt: NOW };
    await episodes.put(db, e);
    expect(await episodes.get(db, e.id)).toEqual(Episode.parse(e));
  });

  it('upload job with parts', async () => {
    const db = await freshDb();
    await mediaAssets.put(db, asset(10));
    const j = uploadJob(id(10), {
      state: 'uploading',
      uploadId: 'up-1',
      parts: [
        { partNumber: 1, etag: 'e1' },
        { partNumber: 2, etag: 'e2' },
      ],
      bytesDone: 10,
      attempts: 1,
      nextAttemptAt: NOW,
    });
    await uploadJobs.put(db, j);
    expect(await uploadJobs.get(db, id(10))).toEqual(UploadJob.parse(j));
  });
});

describe('put of an invalid row', () => {
  it('throws the contract error and writes nothing', async () => {
    const db = await freshDb();
    const bad = { ...cast(30, 'Maya'), name: '' };
    await expect(castMembers.put(db, bad)).rejects.toThrow();
    expect(await db.all('SELECT * FROM cast_members')).toEqual([]);

    const badMoment = { ...note(50, NOW), text: undefined };
    await expect(moments.put(db, badMoment as unknown as Moment)).rejects.toThrow();
    expect(await db.all('SELECT * FROM moments')).toEqual([]);
  });
});
