// The threads of a life, named by the person: create, rename, close, reopen and remove (soft delete).
import { Storyline } from '@life/contracts';
import type { Documentary, LocalDate, Uuid } from '@life/contracts';
import { localDay, words } from '@life/story';
import * as moments from '../data/repositories/moments';
import * as storylines from '../data/repositories/storylines';
import type { SqlDriver } from '../data/sqlite/driver';
import type { Clock, Ids, Store } from './ports';

/** Input the person can correct; the message is a `words` line to show as is. */
export class InputError extends Error {
  override name = 'InputError';
}

export const STORYLINE_TITLE_MAX = 60;

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new InputError(words.tags.titleEmpty);
  if (trimmed.length > STORYLINE_TITLE_MAX) throw new InputError(words.tags.titleTooLong);
  return trimmed;
}

/** A second open storyline with the same title (any case) is refused. */
async function refuseTaken(driver: SqlDriver, documentaryId: string, title: string, self?: string) {
  const open = await storylines.listOpen(driver, documentaryId);
  const lower = title.toLowerCase();
  if (open.some((s) => s.id !== self && s.title.toLowerCase() === lower)) {
    throw new InputError(words.tags.titleTaken);
  }
}

async function live(driver: SqlDriver, id: Uuid): Promise<Storyline> {
  const storyline = await storylines.get(driver, id);
  if (!storyline || storyline.deletedAt) throw new InputError(words.tags.unavailable);
  return storyline;
}

/** Open storylines, oldest first: the ones a moment can be tagged with first. */
export async function listOpenStorylines(
  store: Store,
  documentary: Documentary,
): Promise<Storyline[]> {
  return storylines.listOpen(store.driver, documentary.id);
}

/** A storyline as the Storylines screen shows it: open ones first, each with its moment count. */
export type StorylineSummary = {
  id: Uuid;
  title: string;
  openedOn: LocalDate;
  closed: boolean;
  momentCount: number;
};

export async function listStorylineSummaries(
  store: Store,
  documentary: Documentary,
): Promise<StorylineSummary[]> {
  const live = await storylines.listLive(store.driver, documentary.id);
  const counts = await moments.countByStoryline(store.driver, documentary.id);
  const rows = live.map((s) => ({
    id: s.id,
    title: s.title,
    openedOn: localDay(s.openedAt, documentary.timeZone),
    closed: s.closedAt !== undefined,
    momentCount: counts[s.id] ?? 0,
  }));
  return [...rows.filter((r) => !r.closed), ...rows.filter((r) => r.closed)];
}

export async function createStoryline(
  store: Store,
  clock: Clock,
  ids: Ids,
  documentary: Documentary,
  title: string,
): Promise<Storyline> {
  const clean = cleanTitle(title);
  return store.driver.transaction(async (tx) => {
    await refuseTaken(tx, documentary.id, clean);
    const now = clock.now();
    return storylines.put(
      tx,
      Storyline.parse({
        id: ids.newId(),
        documentaryId: documentary.id,
        title: clean,
        openedAt: now,
        updatedAt: now,
      }),
    );
  });
}

export async function renameStoryline(
  store: Store,
  clock: Clock,
  id: Uuid,
  title: string,
): Promise<Storyline> {
  const clean = cleanTitle(title);
  return store.driver.transaction(async (tx) => {
    const storyline = await live(tx, id);
    if (storyline.closedAt === undefined) await refuseTaken(tx, storyline.documentaryId, clean, id);
    return storylines.put(
      tx,
      Storyline.parse({ ...storyline, title: clean, updatedAt: clock.now() }),
    );
  });
}

export async function closeStoryline(store: Store, clock: Clock, id: Uuid): Promise<Storyline> {
  return store.driver.transaction(async (tx) => {
    const storyline = await live(tx, id);
    const now = clock.now();
    return storylines.put(tx, Storyline.parse({ ...storyline, closedAt: now, updatedAt: now }));
  });
}

export async function reopenStoryline(store: Store, clock: Clock, id: Uuid): Promise<Storyline> {
  return store.driver.transaction(async (tx) => {
    const storyline = await live(tx, id);
    // Reopening would make a second open storyline with the same title.
    await refuseTaken(tx, storyline.documentaryId, storyline.title, id);
    const next: Storyline = { ...storyline, updatedAt: clock.now() };
    delete next.closedAt;
    return storylines.put(tx, Storyline.parse(next));
  });
}

export async function removeStoryline(store: Store, clock: Clock, id: Uuid): Promise<Storyline> {
  return store.driver.transaction(async (tx) => {
    const storyline = await live(tx, id);
    const now = clock.now();
    return storylines.put(tx, Storyline.parse({ ...storyline, deletedAt: now, updatedAt: now }));
  });
}
