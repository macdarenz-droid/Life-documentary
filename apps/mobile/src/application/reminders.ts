// The one daily reminder: stored in the device settings and scheduled as a local notification. Changing
// it replaces the scheduled notification; turning it off cancels it. Words never mention missed days.
import { DailyReminder } from '@life/contracts';
import type { Documentary } from '@life/contracts';
import { words } from '@life/story';
import * as moments from '../data/repositories/moments';
import * as settings from '../data/repositories/settings';
import type { Reminders } from '../domain/capturePorts';
import type { Store } from './ports';

const REMINDER_KEY = 'daily_reminder';
const OFFER_KEY = 'reminder_offer_done';

/** Off at 08:00 until the person allows notifications; then on at 08:00. */
export const DEFAULT_REMINDER: DailyReminder = { enabled: false, hour: 8, minute: 0 };
export const MORNING = { hour: 8, minute: 0 } as const;

export async function readDailyReminder(store: Store): Promise<DailyReminder> {
  const raw = await settings.get(store.driver, REMINDER_KEY);
  return raw === undefined ? DEFAULT_REMINDER : DailyReminder.parse(JSON.parse(raw));
}

export async function setDailyReminder(
  store: Store,
  reminders: Reminders,
  next: { enabled: boolean; hour: number; minute: number },
): Promise<DailyReminder> {
  const wanted = DailyReminder.parse({
    enabled: next.enabled,
    hour: next.hour,
    minute: next.minute,
  });
  const previous = await readDailyReminder(store);
  if (previous.scheduledId) await reminders.cancel(previous.scheduledId);
  let stored: DailyReminder = wanted;
  if (wanted.enabled) {
    const scheduledId = await reminders.scheduleDaily(wanted.hour, wanted.minute, {
      title: words.reminders.notificationTitle,
      body: words.reminders.notificationBody,
    });
    stored = { ...wanted, scheduledId };
  }
  await settings.put(store.driver, REMINDER_KEY, JSON.stringify(DailyReminder.parse(stored)));
  return stored;
}

/** The quiet Today card: only after the first answer, only while the permission is undecided, once. */
export async function shouldOfferReminder(
  store: Store,
  reminders: Reminders,
  documentary: Documentary,
): Promise<boolean> {
  if ((await settings.get(store.driver, OFFER_KEY)) !== undefined) return false;
  if (!(await moments.hasAnswer(store.driver, documentary.id))) return false;
  return (await reminders.permission()) === 'undetermined';
}

/** "Remind me each morning": asks once, and on yes turns the reminder on at 08:00. */
export async function acceptReminderOffer(store: Store, reminders: Reminders): Promise<boolean> {
  await settings.put(store.driver, OFFER_KEY, 'accepted');
  const state = await reminders.request();
  if (state !== 'granted') return false;
  await setDailyReminder(store, reminders, { enabled: true, ...MORNING });
  return true;
}

/** "Not now": the card never comes back. */
export async function dismissReminderOffer(store: Store): Promise<void> {
  await settings.put(store.driver, OFFER_KEY, 'dismissed');
}
