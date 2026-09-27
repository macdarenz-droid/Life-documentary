// Sync on the phone (P6, D37). One round pushes every row changed since the last round, in pages of
// 100, then pulls until the server has nothing newer. Only what `leavesDevice` allows goes out, without
// device-only fields. Pulled rows land with the same last-write-wins rule the server uses. The cursor and
// the push mark move only when the whole round worked, so a failed round is repeated as it was.
import {
  MediaAsset,
  Question,
  SYNC_MAX_CHANGES,
  SyncChange,
  SyncedMediaAsset,
  type Documentary,
  type Moment,
  type SyncEntity,
} from '@life/contracts';
import { addDays, leavesDevice, localDay } from '@life/story';
import * as castMembers from '../data/repositories/castMembers';
import * as documentaries from '../data/repositories/documentaries';
import * as mediaAssets from '../data/repositories/mediaAssets';
import * as moments from '../data/repositories/moments';
import * as questions from '../data/repositories/questions';
import * as storylines from '../data/repositories/storylines';
import * as syncState from '../data/repositories/syncState';
import type { Account, Api } from '../domain/capturePorts';
import type { Clock, Store } from './ports';

/** Fields of a media asset that only mean something on this phone. */
const DEVICE_ONLY = ['localPath', 'wrappedKey', 'posterPath', 'posterWrappedKey', 'uploadState'];

/** Pushed and applied in this order, so what a row points at comes first. */
const ORDER: SyncEntity[] = [
  'documentary',
  'storyline',
  'castMember',
  'mediaAsset',
  'question',
  'moment',
];

export type SyncOutcome =
  | {
      status: 'synced';
      pushed: number;
      pulled: number;
      /** The documentary after the round, when a pulled row replaced it. */
      documentary?: Documentary;
    }
  | { status: 'failed' };

/** A pulled change as it is written here: a media asset keeps this phone's files and keys. */
type Write =
  Exclude<SyncChange, { entity: 'mediaAsset' }> | { entity: 'mediaAsset'; row: MediaAsset };

const running = new WeakMap<Store, Promise<SyncOutcome>>();

/** One sync round; a call while a round runs gets that round. */
export function syncNow(
  store: Store,
  clock: Clock,
  api: Api,
  documentary: Documentary,
): Promise<SyncOutcome> {
  const current = running.get(store);
  if (current) return current;
  const round = runRound(store, api, documentary)
    .catch((error: unknown): SyncOutcome => {
      console.error('The sync round failed.', error);
      return { status: 'failed' };
    })
    .finally(() => running.delete(store));
  running.set(store, round);
  return round;
}

/**
 * Syncs when an account is signed in; signed out, it does nothing. After a restart the cookie cache is
 * empty until the session is read, so a missing cookie asks the account once before giving up.
 */
export async function syncIfSignedIn(
  store: Store,
  clock: Clock,
  account: Account,
  api: Api,
  documentary: Documentary,
): Promise<SyncOutcome | null> {
  if (account.cookie() === null) {
    let user: Awaited<ReturnType<Account['session']>> = null;
    try {
      user = await account.session();
    } catch {
      user = null;
    }
    if (!user) return null;
  }
  return syncNow(store, clock, api, documentary);
}

async function runRound(store: Store, api: Api, documentary: Documentary): Promise<SyncOutcome> {
  const state = await syncState.read(store.driver);
  const outgoing = await collect(store, documentary, state.pushedUpTo);

  let cursor = state.cursor;
  const pulled = new Map<string, SyncChange>();
  const send = async (changes: SyncChange[]): Promise<number> => {
    const response = await api.sync({ documentaryId: documentary.id, cursor, changes });
    for (const change of response.changes) {
      // Derived text (P12) is kept on the phone from T-013e; until then it is skipped.
      if (change.entity === 'derived') continue;
      const key = `${change.entity}:${change.row.id}`;
      pulled.delete(key);
      pulled.set(key, change);
    }
    const moved = response.cursor !== cursor;
    cursor = response.cursor;
    return moved ? response.changes.length : 0;
  };

  let last = 0;
  if (outgoing.changes.length === 0) last = await send([]);
  for (let i = 0; i < outgoing.changes.length; i += SYNC_MAX_CHANGES) {
    last = await send(outgoing.changes.slice(i, i + SYNC_MAX_CHANGES));
  }
  while (last > 0) last = await send([]);

  const applied = await applyPulled(store, documentary, [...pulled.values()]);
  await syncState.write(store.driver, {
    cursor,
    pushedUpTo: outgoing.pushedUpTo ?? state.pushedUpTo,
  });
  return {
    status: 'synced',
    pushed: outgoing.changes.length,
    pulled: applied.count,
    ...(applied.documentary ? { documentary: applied.documentary } : {}),
  };
}

function later(a: string | undefined, b: string): string {
  return a === undefined || Date.parse(b) > Date.parse(a) ? b : a;
}

/** The rows changed since `pushedUpTo` that may leave, as contract-parsed changes. */
async function collect(
  store: Store,
  documentary: Documentary,
  pushedUpTo: string | undefined,
): Promise<{ changes: SyncChange[]; pushedUpTo: string | undefined }> {
  const { driver } = store;
  let mark: string | undefined;
  const out: SyncChange[] = [];

  const doc = await syncState.changedDocumentary(driver, documentary.id, pushedUpTo);
  if (doc) {
    mark = later(mark, doc.updatedAt);
    out.push({ entity: 'documentary', row: doc });
  }
  for (const row of await syncState.changedStorylines(driver, documentary.id, pushedUpTo)) {
    mark = later(mark, row.updatedAt);
    out.push({ entity: 'storyline', row });
  }
  for (const row of await syncState.changedCastMembers(driver, documentary.id, pushedUpTo)) {
    mark = later(mark, row.updatedAt);
    out.push({ entity: 'castMember', row });
  }

  const leaving: Moment[] = [];
  const kept = new Set<string>();
  const assets: SyncChange[] = [];
  for (const moment of await syncState.changedMoments(driver, documentary.id, pushedUpTo)) {
    // A refused moment still moves the mark: it changed, and it will be refused again.
    mark = later(mark, moment.updatedAt);
    const asset = moment.mediaAssetId
      ? await mediaAssets.get(driver, moment.mediaAssetId)
      : undefined;
    const decision = leavesDevice(
      { ...moment, ...(asset ? { assetKind: asset.kind } : {}) },
      { cloudBackup: false },
    );
    if (!decision.row) {
      kept.add(moment.id);
      continue;
    }
    leaving.push(moment);
    if (asset) {
      const synced = SyncedMediaAsset.parse(
        Object.fromEntries(Object.entries(asset).filter(([field]) => !DEVICE_ONLY.includes(field))),
      );
      assets.push({ entity: 'mediaAsset', row: synced });
    }
  }
  out.push(...assets);

  // Questions have no updatedAt: the ones asked from the day before the mark on (a time zone's width),
  // and the ones the pushed moments answer.
  const fromDay = pushedUpTo ? addDays(localDay(pushedUpTo, documentary.timeZone), -1) : undefined;
  const asked = new Map<string, Question>();
  for (const q of await syncState.questionsAskedFrom(driver, documentary.id, fromDay)) {
    asked.set(q.id, q);
  }
  for (const moment of leaving) {
    if (moment.questionId && !asked.has(moment.questionId)) {
      const q = await questions.get(driver, moment.questionId);
      if (q) asked.set(q.id, q);
    }
  }
  for (const q of asked.values()) {
    // The id of a moment kept on the phone does not leave either.
    const answered = q.answeredByMomentId;
    const localOnlyAnswer =
      answered !== undefined &&
      (kept.has(answered) || (await moments.get(driver, answered))?.localOnly === true);
    const row = localOnlyAnswer
      ? Question.parse(
          Object.fromEntries(Object.entries(q).filter(([field]) => field !== 'answeredByMomentId')),
        )
      : q;
    out.push({ entity: 'question', row });
  }

  for (const row of leaving) out.push({ entity: 'moment', row });
  return { changes: out.map((c) => SyncChange.parse(c)), pushedUpTo: mark };
}

/** Whether `incoming` is strictly newer than `stored`; ties keep the stored row. */
function newer(
  incoming: { updatedAt: string },
  stored: { updatedAt: string } | undefined,
): boolean {
  return stored === undefined || Date.parse(incoming.updatedAt) > Date.parse(stored.updatedAt);
}

/**
 * Lands pulled rows with last-write-wins. A media asset only updates one this phone holds (its files
 * and keys stay); a moment lands only when everything it points at is on the phone (its media, question,
 * storylines and people), and a question only when its storyline and answering moment are.
 */
async function applyPulled(
  store: Store,
  documentary: Documentary,
  pulled: SyncChange[],
): Promise<{ count: number; documentary?: Documentary }> {
  const { driver } = store;
  const sorted = [...pulled].sort((a, b) => ORDER.indexOf(a.entity) - ORDER.indexOf(b.entity));
  const writes: Write[] = [];
  let nextDocumentary: Documentary | undefined;

  const storylineIds = new Set<string>();
  const castIds = new Set<string>();
  const candidateMoments = new Map<string, Moment>();
  const candidateQuestions = new Map<string, Question>();

  for (const change of sorted) {
    switch (change.entity) {
      case 'documentary': {
        if (change.row.id !== documentary.id) break;
        if (newer(change.row, await documentaries.get(driver, change.row.id))) {
          writes.push(change);
          nextDocumentary = change.row;
        }
        break;
      }
      case 'storyline': {
        storylineIds.add(change.row.id);
        if (newer(change.row, await storylines.get(driver, change.row.id))) writes.push(change);
        break;
      }
      case 'castMember': {
        castIds.add(change.row.id);
        if (newer(change.row, await castMembers.get(driver, change.row.id))) writes.push(change);
        break;
      }
      case 'mediaAsset': {
        const local = await mediaAssets.get(driver, change.row.id);
        if (!local) break;
        // The pulled row has no device-only fields, so the local ones stay.
        writes.push({ entity: 'mediaAsset', row: MediaAsset.parse({ ...local, ...change.row }) });
        break;
      }
      case 'question': {
        const local = await questions.get(driver, change.row.id);
        const sameDay = await questions.getForDay(
          driver,
          change.row.documentaryId,
          change.row.askedOn,
        );
        if (sameDay && sameDay.id !== change.row.id) break;
        const row: Question =
          change.row.answeredByMomentId === undefined && local?.answeredByMomentId
            ? { ...change.row, answeredByMomentId: local.answeredByMomentId }
            : change.row;
        candidateQuestions.set(row.id, row);
        break;
      }
      case 'moment': {
        if (newer(change.row, await moments.get(driver, change.row.id))) {
          candidateMoments.set(change.row.id, change.row);
        }
        break;
      }
    }
  }

  const has = async <T>(
    id: string,
    pulledIds: { has(id: string): boolean },
    get: (d: typeof driver, id: string) => Promise<T | undefined>,
  ) => pulledIds.has(id) || (await get(driver, id)) !== undefined;

  // A moment and the question it answers point at each other: drop what cannot land until nothing moves.
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, m] of candidateMoments) {
      const ok =
        (m.mediaAssetId === undefined ||
          (await mediaAssets.get(driver, m.mediaAssetId)) !== undefined) &&
        (m.questionId === undefined ||
          (await has(m.questionId, candidateQuestions, questions.get))) &&
        (await every(m.storylineIds, (s) => has(s, storylineIds, storylines.get))) &&
        (await every(m.castIds, (c) => has(c, castIds, castMembers.get)));
      if (!ok) {
        candidateMoments.delete(id);
        changed = true;
      }
    }
    for (const [id, q] of candidateQuestions) {
      const ok =
        (q.storylineId === undefined || (await has(q.storylineId, storylineIds, storylines.get))) &&
        (q.answeredByMomentId === undefined ||
          (await has(q.answeredByMomentId, candidateMoments, moments.get)));
      if (!ok) {
        candidateQuestions.delete(id);
        changed = true;
      }
    }
  }
  for (const row of candidateQuestions.values()) writes.push({ entity: 'question', row });
  for (const row of candidateMoments.values()) writes.push({ entity: 'moment', row });

  await syncState.applyPulled(driver, async (tx) => {
    for (const change of writes) {
      switch (change.entity) {
        case 'documentary':
          await documentaries.put(tx, change.row);
          break;
        case 'storyline':
          await storylines.put(tx, change.row);
          break;
        case 'castMember':
          await castMembers.put(tx, change.row);
          break;
        case 'mediaAsset':
          await mediaAssets.put(tx, change.row);
          break;
        case 'question':
          await questions.put(tx, change.row);
          break;
        case 'moment':
          await moments.put(tx, change.row);
          break;
      }
    }
  });
  return { count: writes.length, ...(nextDocumentary ? { documentary: nextDocumentary } : {}) };
}

async function every<T>(list: T[], test: (item: T) => Promise<boolean>): Promise<boolean> {
  for (const item of list) if (!(await test(item))) return false;
  return true;
}
