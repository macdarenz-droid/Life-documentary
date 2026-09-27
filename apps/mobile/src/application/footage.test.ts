import { addDays, words } from '@life/story';
import type { LocalDate, Uuid } from '@life/contracts';
import { fileWithHead, ftyp } from '../data/fileStore/testing/containerFixtures';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as uploadJobs from '../data/repositories/uploadJobs';
import { captureMoment } from './captureMoment';
import {
  deleteMoment,
  editMoment,
  footageByStoryline,
  footageDays,
  footageStorylines,
  oneYearAgo,
} from './footage';
import { ensurePoster } from './posters';
import { closeStoryline, createStoryline, InputError } from './storylines';
import { tagMoment } from './tagMoment';
import { todayHarness } from './testing/todayHarness';
import { todayQuestion } from './todayQuestion';

type Harness = Awaited<ReturnType<typeof todayHarness>>;

function clock(h: Harness) {
  return h.ctx.clock as typeof h.ctx.clock & { set(next: string): void };
}

/** A note captured at `at` (UTC); Berlin is UTC+1 in winter. */
async function noteAt(h: Harness, at: string, text = 'A slow morning.') {
  clock(h).set(at);
  return captureMoment(h.store, h.ctx.clock, h.ctx.ids, { kind: 'note', text, localOnly: false });
}

describe('footageDays', () => {
  it('pages over 20 days with a gap, leaving deleted moments and all-deleted days out', async () => {
    const h = await todayHarness('2027-01-01T09:00:00Z');
    const seeded: LocalDate[] = [];
    for (let i = 0; i < 22; i++) {
      if (i === 9 || i === 10) continue; // the gap
      const day = addDays('2027-01-01', i);
      seeded.push(day);
      await noteAt(h, `${day}T08:00:00Z`);
      await noteAt(h, `${day}T18:30:00Z`, 'Evening.');
    }
    // A deleted moment on a live day, and a day with only a deleted moment.
    const gone = await noteAt(h, '2027-01-05T12:00:00Z', 'Gone.');
    await deleteMoment(h.store, h.ctx.clock, gone.id);
    const lone = await noteAt(h, '2027-01-30T12:00:00Z', 'Gone too.');
    await deleteMoment(h.store, h.ctx.clock, lone.id);

    const pages: LocalDate[][] = [];
    let before: LocalDate | undefined;
    for (;;) {
      const page = await footageDays(h.store, h.ctx.documentary, {
        ...(before ? { beforeDay: before } : {}),
        days: 7,
      });
      if (page.length === 0) break;
      pages.push(page.map((d) => d.date));
      before = page[page.length - 1]!.date;
    }
    expect(pages.map((p) => p.length)).toEqual([7, 7, 6]);
    expect(pages.flat()).toEqual([...seeded].reverse());

    const [first] = await footageDays(h.store, h.ctx.documentary, { days: 1 });
    expect(first?.date).toBe('2027-01-22');
    expect(first?.dayLabel).toBe('Friday 22 January');
    expect(first?.items.map((i) => [i.timeLabel, i.text])).toEqual([
      ['09:00', 'A slow morning.'],
      ['19:30', 'Evening.'],
    ]);
    const jan5 = await footageDays(h.store, h.ctx.documentary, {
      beforeDay: '2027-01-06',
      days: 1,
    });
    expect(jan5[0]?.items.map((i) => i.text)).toEqual(['A slow morning.', 'Evening.']);
  });

  it('shows what the screens need for an answer with media', async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    h.store.io.files.set('tmp/clip', fileWithHead(ftyp('qt  ')));
    const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
      kind: 'answer',
      questionId: question.id,
      media: {
        sourcePath: 'tmp/clip',
        mediaKind: 'video',
        durationMs: 9400,
        width: 1080,
        height: 1920,
      },
      mood: 'calm',
      placeName: 'The harbour',
      localOnly: true,
    });
    await ensurePoster(h.store, h.services.posters, moment.mediaAssetId!);
    const [day] = await footageDays(h.store, h.ctx.documentary, { days: 1 });
    expect(day?.items).toEqual([
      {
        id: moment.id,
        kind: 'answer',
        mediaKind: 'video',
        assetId: moment.mediaAssetId,
        timeLabel: '10:30',
        durationLabel: '0:09',
        durationSpoken: '9 seconds',
        questionText: question.text,
        mood: 'calm',
        placeName: 'The harbour',
        storylineIds: [],
        castIds: [],
        localOnly: true,
        hasPoster: true,
      },
    ]);
  });
});

describe('footage by storyline', () => {
  it('lists a storyline newest first, and open storylines before closed ones, with counts', async () => {
    const h = await todayHarness('2027-03-01T09:00:00Z');
    const job = await createStoryline(
      h.store,
      h.ctx.clock,
      h.ctx.ids,
      h.ctx.documentary,
      'The new job',
    );
    const race = await createStoryline(
      h.store,
      h.ctx.clock,
      h.ctx.ids,
      h.ctx.documentary,
      'Half marathon',
    );
    await createStoryline(h.store, h.ctx.clock, h.ctx.ids, h.ctx.documentary, 'Empty');
    const tag = async (at: string, ids: Uuid[]) => {
      const m = await noteAt(h, at);
      await tagMoment(h.store, h.ctx.clock, m.id, { storylineIds: ids, castIds: [] });
      return m.id;
    };
    const a = await tag('2027-03-02T08:00:00Z', [race.id]);
    const b = await tag('2027-03-04T08:00:00Z', [race.id, job.id]);
    const c = await tag('2027-03-03T08:00:00Z', [race.id]);
    await closeStoryline(h.store, h.ctx.clock, race.id);

    expect(
      (await footageByStoryline(h.store, h.ctx.documentary, race.id)).map((i) => i.id),
    ).toEqual([b, c, a]);
    expect(await footageStorylines(h.store, h.ctx.documentary)).toEqual([
      { id: job.id, title: 'The new job', closed: false, count: 1 },
      { id: race.id, title: 'Half marathon', closed: true, count: 3 },
    ]);
  });
});

describe('oneYearAgo', () => {
  it('reads 2027-02-28 on 2028-02-29, oldest first', async () => {
    const h = await todayHarness('2027-02-28T09:00:00Z');
    await noteAt(h, '2027-02-28T17:00:00Z', 'Later.');
    await noteAt(h, '2027-02-28T07:00:00Z', 'Earlier.');
    await noteAt(h, '2027-03-01T07:00:00Z', 'Next day.');
    expect((await oneYearAgo(h.store, h.ctx.documentary, '2028-02-29')).map((i) => i.text)).toEqual(
      ['Earlier.', 'Later.'],
    );
    expect(await oneYearAgo(h.store, h.ctx.documentary, '2028-03-02')).toEqual([]);
  });
});

describe('editMoment', () => {
  it('trims the text, sets and removes a mood, and bumps updatedAt', async () => {
    const h = await todayHarness();
    const note = await noteAt(h, '2027-03-15T09:30:00Z');
    clock(h).set('2027-03-16T10:00:00Z');
    const edited = await editMoment(h.store, h.ctx.clock, note.id, {
      text: '  The tide came in.  ',
      mood: 'calm',
    });
    expect(edited).toMatchObject({ text: 'The tide came in.', mood: 'calm' });
    expect(edited.updatedAt).toBe('2027-03-16T10:00:00Z');
    const moodless = await editMoment(h.store, h.ctx.clock, note.id, { mood: null });
    expect(moodless.mood).toBeUndefined();
    expect((await moments.get(h.store.driver, note.id))?.mood).toBeUndefined();
    expect((await moments.get(h.store.driver, note.id))?.text).toBe('The tide came in.');
  });

  it('refuses a 281-character text and an empty text on a note', async () => {
    const h = await todayHarness();
    const note = await noteAt(h, '2027-03-15T09:30:00Z');
    await expect(
      editMoment(h.store, h.ctx.clock, note.id, { text: 'a'.repeat(281) }),
    ).rejects.toEqual(new InputError(words.footage.noteTooLong));
    await expect(
      editMoment(h.store, h.ctx.clock, note.id, { text: 'a'.repeat(280) }),
    ).resolves.toMatchObject({ text: 'a'.repeat(280) });
    for (const text of ['', '   ', null]) {
      await expect(editMoment(h.store, h.ctx.clock, note.id, { text })).rejects.toEqual(
        new InputError(words.footage.noteEmpty),
      );
    }
  });

  it('removes the text of a moment that is not a note', async () => {
    const h = await todayHarness();
    h.store.io.files.set('tmp/p', fileWithHead(ftyp('heic')));
    const photo = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
      kind: 'photo',
      media: { sourcePath: 'tmp/p', mediaKind: 'photo', width: 3024, height: 4032 },
      localOnly: false,
    });
    await editMoment(h.store, h.ctx.clock, photo.id, { text: 'The harbour at dawn' });
    const cleared = await editMoment(h.store, h.ctx.clock, photo.id, { text: null });
    expect(cleared.text).toBeUndefined();
  });
});

describe('deleteMoment', () => {
  it("leaves a tombstone, no upload job, no files, and today's question answerable again", async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    h.store.io.files.set('tmp/clip', fileWithHead(ftyp('qt  ')));
    const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
      kind: 'answer',
      questionId: question.id,
      media: {
        sourcePath: 'tmp/clip',
        mediaKind: 'video',
        durationMs: 6000,
        width: 1080,
        height: 1920,
      },
      localOnly: false,
    });
    h.store.io.files.delete('tmp/clip');
    const assetId = moment.mediaAssetId!;
    await ensurePoster(h.store, h.services.posters, assetId);
    expect(await uploadJobs.get(h.store.driver, assetId)).toBeDefined();
    expect(
      (await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids)).answeredByMomentId,
    ).toBe(moment.id);

    await deleteMoment(h.store, h.ctx.clock, moment.id);

    expect((await moments.get(h.store.driver, moment.id))?.deletedAt).toBe('2027-03-15T09:30:00Z');
    expect(await uploadJobs.get(h.store.driver, assetId)).toBeUndefined();
    expect([...h.store.io.files.keys()]).toEqual([]);
    expect(await mediaAssets.get(h.store.driver, assetId)).toBeDefined();
    const again = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    expect(again.id).toBe(question.id);
    expect(again.answeredByMomentId).toBeUndefined();
    expect(await footageDays(h.store, h.ctx.documentary, { days: 7 })).toEqual([]);

    const tables = ['moments', 'questions', 'media_assets', 'upload_jobs'];
    const snapshot = async () => {
      const out: Record<string, unknown[]> = {};
      for (const t of tables)
        out[t] = await h.store.driver.all(`SELECT * FROM ${t} ORDER BY rowid`);
      return out;
    };
    const before = await snapshot();
    clock(h).set('2027-03-16T09:30:00Z');
    await deleteMoment(h.store, h.ctx.clock, moment.id);
    expect(await snapshot()).toEqual(before);
    expect([...h.store.io.files.keys()]).toEqual([]);
  });
});
