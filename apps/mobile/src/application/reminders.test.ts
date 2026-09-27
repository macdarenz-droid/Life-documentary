import { words } from '@life/story';
import { fakeServices } from '../services/testing/fakeServices';
import { openLocalDocumentary } from './bootstrap';
import { captureMoment } from './captureMoment';
import {
  acceptReminderOffer,
  dismissReminderOffer,
  readDailyReminder,
  setDailyReminder,
  shouldOfferReminder,
} from './reminders';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';
import { todayQuestion } from './todayQuestion';

async function setup() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  const { reminders } = fakeServices();
  return { store, clock, ids, documentary, reminders };
}

describe('setDailyReminder', () => {
  it('schedules once at the chosen hour and minute with the plain words', async () => {
    const { store, reminders } = await setup();
    const saved = await setDailyReminder(store, reminders, { enabled: true, hour: 8, minute: 0 });
    expect([...reminders.scheduled.values()]).toEqual([
      {
        hour: 8,
        minute: 0,
        title: words.reminders.notificationTitle,
        body: words.reminders.notificationBody,
      },
    ]);
    expect(saved.scheduledId).toBe([...reminders.scheduled.keys()][0]);
    expect(await readDailyReminder(store)).toEqual(saved);
  });

  it('replaces the scheduled notification when the time changes', async () => {
    const { store, reminders } = await setup();
    const first = await setDailyReminder(store, reminders, { enabled: true, hour: 8, minute: 0 });
    await setDailyReminder(store, reminders, { enabled: true, hour: 21, minute: 45 });
    expect(reminders.cancelled).toEqual([first.scheduledId]);
    expect([...reminders.scheduled.values()]).toMatchObject([{ hour: 21, minute: 45 }]);
  });

  it('cancels when turned off and keeps the chosen time', async () => {
    const { store, reminders } = await setup();
    const first = await setDailyReminder(store, reminders, { enabled: true, hour: 7, minute: 30 });
    const off = await setDailyReminder(store, reminders, { enabled: false, hour: 7, minute: 30 });
    expect(reminders.cancelled).toEqual([first.scheduledId]);
    expect(reminders.scheduled.size).toBe(0);
    expect(off).toEqual({ enabled: false, hour: 7, minute: 30 });
    expect(await readDailyReminder(store)).toEqual(off);
  });

  it('reads the stored setting after a restart and replaces the old notification', async () => {
    const { store, reminders } = await setup();
    const first = await setDailyReminder(store, reminders, { enabled: true, hour: 8, minute: 0 });
    // A restart: new services, the same store.
    const after = fakeServices().reminders;
    expect(await readDailyReminder(store)).toEqual(first);
    await setDailyReminder(store, after, { enabled: true, hour: 9, minute: 15 });
    expect(after.cancelled).toEqual([first.scheduledId]);
    expect([...after.scheduled.values()]).toMatchObject([{ hour: 9, minute: 15 }]);
  });

  it('is off at 08:00 before anything is stored', async () => {
    const { store } = await setup();
    expect(await readDailyReminder(store)).toEqual({ enabled: false, hour: 8, minute: 0 });
  });
});

describe('the reminder offer', () => {
  async function answer(h: Awaited<ReturnType<typeof setup>>) {
    const q = await todayQuestion(h.store, h.documentary, h.clock, h.ids);
    await captureMoment(h.store, h.clock, h.ids, {
      kind: 'note',
      text: 'Only a note.',
      localOnly: false,
    });
    h.store.io.files.set('tmp/a.m4a', new Uint8Array(64).fill(3));
    await captureMoment(h.store, h.clock, h.ids, {
      kind: 'answer',
      questionId: q.id,
      media: { sourcePath: 'tmp/a.m4a', mediaKind: 'audio', durationMs: 4000 },
      localOnly: false,
    });
  }

  it('is not offered before the first answer', async () => {
    const h = await setup();
    await captureMoment(h.store, h.clock, h.ids, {
      kind: 'note',
      text: 'A note.',
      localOnly: false,
    });
    expect(await shouldOfferReminder(h.store, h.reminders, h.documentary)).toBe(false);
  });

  it('is offered after the first answer while the permission is undecided', async () => {
    const h = await setup();
    await answer(h);
    expect(await shouldOfferReminder(h.store, h.reminders, h.documentary)).toBe(true);
    h.reminders.state = 'denied';
    expect(await shouldOfferReminder(h.store, h.reminders, h.documentary)).toBe(false);
  });

  it('never comes back after "Not now"', async () => {
    const h = await setup();
    await answer(h);
    await dismissReminderOffer(h.store);
    expect(await shouldOfferReminder(h.store, h.reminders, h.documentary)).toBe(false);
  });

  it('turns the reminder on at 08:00 when accepted and allowed', async () => {
    const h = await setup();
    await answer(h);
    expect(await acceptReminderOffer(h.store, h.reminders)).toBe(true);
    expect(await readDailyReminder(h.store)).toMatchObject({ enabled: true, hour: 8, minute: 0 });
    expect(await shouldOfferReminder(h.store, h.reminders, h.documentary)).toBe(false);
  });
});
