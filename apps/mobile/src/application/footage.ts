// Footage (P10): what the screens show about past moments, and the edits and delete. Everything is
// read from the device store; nothing leaves the device here.
import {
  Moment,
  type Documentary,
  type LocalDate,
  type MomentMood,
  type Uuid,
} from '@life/contracts';
import {
  NOTE_MAX_LENGTH,
  dayLabel,
  durationLabel,
  durationWords,
  oneYearBefore,
  timeLabel,
  words,
} from '@life/story';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as questions from '../data/repositories/questions';
import * as storylines from '../data/repositories/storylines';
import * as uploadJobs from '../data/repositories/uploadJobs';
import type { Clock, Store } from './ports';
import { InputError } from './storylines';

/** Only what the Footage screens show about one moment. */
export type FootageItem = {
  id: Uuid;
  kind: Moment['kind'];
  mediaKind?: 'video' | 'photo' | 'audio';
  timeLabel: string;
  durationLabel?: string;
  /** The duration as a screen reader says it: "9 seconds". */
  durationSpoken?: string;
  questionText?: string;
  text?: string;
  mood?: MomentMood;
  placeName?: string;
  storylineIds: Uuid[];
  castIds: Uuid[];
  localOnly: boolean;
  hasPoster: boolean;
  assetId?: Uuid;
};

export type FootageDay = { date: LocalDate; dayLabel: string; items: FootageItem[] };

export type FootageStoryline = { id: Uuid; title: string; closed: boolean; count: number };

async function toItem(store: Store, moment: Moment): Promise<FootageItem> {
  const asset = moment.mediaAssetId
    ? await mediaAssets.get(store.driver, moment.mediaAssetId)
    : undefined;
  const question = moment.questionId
    ? await questions.get(store.driver, moment.questionId)
    : undefined;
  return {
    id: moment.id,
    kind: moment.kind,
    ...(asset ? { mediaKind: asset.kind, assetId: asset.id } : {}),
    timeLabel: timeLabel(moment.capturedAt, moment.timeZone),
    ...(asset?.durationMs !== undefined
      ? {
          durationLabel: durationLabel(asset.durationMs),
          durationSpoken: durationWords(asset.durationMs),
        }
      : {}),
    ...(question ? { questionText: question.text } : {}),
    ...(moment.text !== undefined ? { text: moment.text } : {}),
    ...(moment.mood !== undefined ? { mood: moment.mood } : {}),
    ...(moment.placeName !== undefined ? { placeName: moment.placeName } : {}),
    storylineIds: moment.storylineIds,
    castIds: moment.castIds,
    localOnly: moment.localOnly,
    hasPoster: asset?.posterPath !== undefined,
  };
}

async function toItems(store: Store, list: Moment[]): Promise<FootageItem[]> {
  const items: FootageItem[] = [];
  for (const moment of list) items.push(await toItem(store, moment));
  return items;
}

/** One live moment as the viewer shows it; null when it is gone. */
export async function footageItem(store: Store, id: Uuid): Promise<FootageItem | null> {
  const moment = await moments.get(store.driver, id);
  return moment && !moment.deletedAt ? toItem(store, moment) : null;
}

/** Up to `days` days with live moments, newest first, strictly before `beforeDay` when given. */
export async function footageDays(
  store: Store,
  documentary: Documentary,
  options: { beforeDay?: LocalDate; days: number },
): Promise<FootageDay[]> {
  const dates = await moments.daysBefore(
    store.driver,
    documentary.id,
    options.beforeDay,
    options.days,
  );
  const days: FootageDay[] = [];
  for (const date of dates) {
    const list = await moments.listByDays(store.driver, documentary.id, date, date);
    days.push({ date, dayLabel: dayLabel(date), items: await toItems(store, list) });
  }
  return days;
}

/** A storyline's live moments, newest first. */
export async function footageByStoryline(
  store: Store,
  documentary: Documentary,
  storylineId: Uuid,
): Promise<FootageItem[]> {
  return toItems(store, await moments.listByStoryline(store.driver, documentary.id, storylineId));
}

/** Open, then closed storylines that hold at least one live moment, with their counts. */
export async function footageStorylines(
  store: Store,
  documentary: Documentary,
): Promise<FootageStoryline[]> {
  const counts = await moments.countByStoryline(store.driver, documentary.id);
  const live = await storylines.listLive(store.driver, documentary.id);
  const withMoments = live
    .filter((s) => (counts[s.id] ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      title: s.title,
      closed: s.closedAt !== undefined,
      count: counts[s.id] ?? 0,
    }));
  return [...withMoments.filter((s) => !s.closed), ...withMoments.filter((s) => s.closed)];
}

/** The moments of the same day one year before `today`, oldest first. */
export async function oneYearAgo(
  store: Store,
  documentary: Documentary,
  today: LocalDate,
): Promise<FootageItem[]> {
  const day = oneYearBefore(today);
  return toItems(store, await moments.listByDays(store.driver, documentary.id, day, day));
}

/**
 * Changes a moment's note text and mood. `null` removes a field; text is trimmed and holds up to
 * 280 characters; a note keeps its text. Tags go through tagMoment.
 */
export async function editMoment(
  store: Store,
  clock: Clock,
  id: Uuid,
  patch: { text?: string | null; mood?: MomentMood | null },
): Promise<Moment> {
  const text =
    patch.text === undefined ? undefined : patch.text === null ? null : patch.text.trim();
  if (typeof text === 'string' && text.length > NOTE_MAX_LENGTH) {
    throw new InputError(words.footage.noteTooLong);
  }
  return store.driver.transaction(async (tx) => {
    const moment = await moments.get(tx, id);
    if (!moment || moment.deletedAt) throw new InputError(words.footage.unavailable);
    const next: Moment = { ...moment, updatedAt: clock.now() };
    if (text !== undefined) {
      if (text === null || text === '') {
        if (moment.kind === 'note') throw new InputError(words.footage.noteEmpty);
        delete next.text;
      } else {
        next.text = text;
      }
    }
    if (patch.mood !== undefined) {
      if (patch.mood === null) delete next.mood;
      else next.mood = patch.mood;
    }
    return moments.put(tx, Moment.parse(next));
  });
}

/**
 * Deletes a moment: a tombstone, no upload job, the day's question free again when this was its
 * answer, then the encrypted original and poster are removed. The media asset row stays (the
 * tombstone points at it). A second call changes nothing.
 */
export async function deleteMoment(store: Store, clock: Clock, id: Uuid): Promise<void> {
  const previews: string[] = [];
  const moment = await store.driver.transaction(async (tx) => {
    const found = await moments.get(tx, id);
    if (!found || found.deletedAt) return found;
    await moments.softDelete(tx, id, clock.now());
    if (found.mediaAssetId) {
      // A photo's preview waiting to go up is removed with its job.
      for (const job of await uploadJobs.listForAsset(tx, found.mediaAssetId)) {
        if (job.sourcePath) previews.push(job.sourcePath);
      }
      await uploadJobs.remove(tx, found.mediaAssetId);
    }
    if (found.questionId) await questions.clearAnswer(tx, found.questionId, found.id);
    return found;
  });
  if (!moment?.mediaAssetId) return;
  const asset = await mediaAssets.get(store.driver, moment.mediaAssetId);
  for (const path of [asset?.localPath, asset?.posterPath, ...previews]) {
    if (path && (await store.io.exists(path))) await store.io.remove(path);
  }
}
