import { Documentary, EpisodePlanV1, Me, SyncResponse, type Uuid } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { database } from '../src/data/db';
import * as episodeRuns from '../src/data/repositories/episodeRuns';
import * as episodes from '../src/data/repositories/episodes';
import * as plans from '../src/data/repositories/plans';
import { bindings, testApp } from './session';

const T0 = '2027-03-15T08:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const WEEK = { weekStart: '2027-03-07', weekEnd: '2027-03-13' };
const DUE = '2027-03-14T17:00:00.000Z';
const BYTES = new Uint8Array(1000).map((_, i) => i % 256);

/** A signed-in person with a linked documentary. */
async function person(email: string) {
  const phone = testApp();
  const cookie = await phone.signIn(email);
  const me = Me.parse(await (await phone.call('/me', { cookie })).json());
  const documentary = Documentary.parse({
    id: crypto.randomUUID(),
    ownerUserId: me.userId,
    title: 'My documentary',
    kind: 'solo',
    timeZone: 'Europe/Berlin',
    episodeDay: 0,
    episodeHour: 18,
    createdAt: T0,
    updatedAt: T0,
  });
  expect((await phone.post('/documentaries/link', documentary, cookie)).status).toBe(200);
  const pull = async () => {
    const res = await phone.post(
      '/sync',
      { documentaryId: documentary.id, cursor: null, changes: [] },
      cookie,
    );
    expect(res.status).toBe(200);
    return SyncResponse.parse(await res.json());
  };
  const video = (episodeId: string, range?: string) =>
    phone.call(`/episodes/${episodeId}/video`, {
      cookie,
      ...(range ? { headers: { range } } : {}),
    });
  return { documentary, pull, video };
}

function plan(title: string) {
  const moment = crypto.randomUUID();
  return EpisodePlanV1.parse({
    version: 1,
    title,
    episodeNumber: 1,
    ...WEEK,
    coldOpen: { momentId: moment, inMs: 0, outMs: 2000 },
    scenes: [{ heading: 'Tuesday', shots: [{ momentId: moment }], captionsFromTranscript: true }],
    closing: { momentId: moment },
    music: { mood: 'calm' },
    lowerThirds: [],
    targetDurationMs: 30_000,
    summary: 'A quiet week.',
  });
}

/** An episode with a plan; `ready` also stores and delivers a render. */
async function episodeFor(documentaryId: Uuid, ready: boolean) {
  const db = database(bindings.DB);
  const episode = await episodes.getOrCreate(db, documentaryId, WEEK.weekStart, at(0));
  await episodeRuns.start(
    db,
    { documentaryId, weekStart: WEEK.weekStart },
    { episodeId: episode.id, startedAt: at(0), dueAt: DUE },
  );
  await plans.put(db, {
    episodeId: episode.id,
    version: 1,
    plan: plan('The week it rained'),
    createdBy: 'model',
    createdAt: at(1),
  });
  await episodes.setPlan(
    db,
    episode.id,
    { version: 1, summary: 'A quiet week.', state: 'rendering' },
    at(1),
  );
  if (ready) {
    const key = `test/${episode.id}/r1.mp4`;
    await bindings.MEDIA.put(key, BYTES);
    await episodes.setRender(db, episode.id, 1, key, 30_000, at(2));
    await episodes.setDelivered(db, episode.id, at(3));
  }
  return episode;
}

describe('episodes to the phone', () => {
  it('a pull carries the summary without storage keys, with the plan title and due time', async () => {
    const ada = await person('ada-episodes@example.com');
    const episode = await episodeFor(ada.documentary.id, true);

    const pulled = await ada.pull();
    const rows = pulled.changes.filter((c) => c.entity === 'episode').map((c) => c.row);
    expect(rows).toEqual([
      {
        id: episode.id,
        documentaryId: ada.documentary.id,
        number: 1,
        ...WEEK,
        state: 'ready',
        title: 'The week it rained',
        durationMs: 30_000,
        renderVersion: 1,
        dueAt: DUE,
        deliveredAt: at(3),
        updatedAt: at(3),
      },
    ]);
    expect(JSON.stringify(pulled)).not.toContain('mp4');
  });

  it('a week that ended empty is never pulled', async () => {
    const bo = await person('bo-episodes@example.com');
    const db = database(bindings.DB);
    const episodeChanges = async () =>
      (await bo.pull()).changes.filter((c) => c.entity === 'episode');
    const episode = await episodes.getOrCreate(db, bo.documentary.id, WEEK.weekStart, at(0));
    await episodes.setState(db, episode.id, 'understanding', at(0));
    // Before its plan, the episode is not pulled, though its row exists.
    expect(await episodeChanges()).toEqual([]);
    await episodes.setState(db, episode.id, 'planning', at(1));
    expect(await episodeChanges()).toEqual([]);
    await episodes.remove(db, episode.id);
    expect(await episodeChanges()).toEqual([]);
  });

  it('sends the whole file, a byte range, and refuses a range past the end', async () => {
    const cy = await person('cy-episodes@example.com');
    const episode = await episodeFor(cy.documentary.id, true);

    const whole = await cy.video(episode.id);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    expect(whole.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(BYTES);

    const part = await cy.video(episode.id, 'bytes=0-99');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 0-99/1000');
    expect(part.headers.get('accept-ranges')).toBe('bytes');
    expect(part.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(BYTES.slice(0, 100));

    const past = await cy.video(episode.id, 'bytes=1000-');
    expect(past.status).toBe(416);
    expect(past.headers.get('content-range')).toBe('bytes */1000');
    expect(past.headers.get('accept-ranges')).toBe('bytes');
    await past.arrayBuffer();
  });

  it('gives 404 to another person and for an episode that is not ready', async () => {
    const dee = await person('dee-episodes@example.com');
    const eve = await person('eve-episodes@example.com');
    const ready = await episodeFor(dee.documentary.id, true);
    const making = await episodeFor(eve.documentary.id, false);

    expect((await eve.video(ready.id)).status).toBe(404);
    expect((await eve.video(making.id)).status).toBe(404);
    expect((await dee.video(making.id)).status).toBe(404);
    const own = await dee.video(ready.id);
    expect(own.status).toBe(200);
    await own.arrayBuffer();
  });
});
