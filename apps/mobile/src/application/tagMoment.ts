// Replaces a moment's storyline and cast tags. Only live storylines and people of the moment's own
// documentary, each once, at most 10 storylines and 20 people.
import { Moment } from '@life/contracts';
import type { Uuid } from '@life/contracts';
import { words } from '@life/story';
import * as castMembers from '../data/repositories/castMembers';
import * as moments from '../data/repositories/moments';
import * as storylines from '../data/repositories/storylines';
import type { Clock, Store } from './ports';
import { InputError } from './storylines';

export const MAX_STORYLINE_TAGS = 10;
export const MAX_CAST_TAGS = 20;

export async function tagMoment(
  store: Store,
  clock: Clock,
  momentId: Uuid,
  tags: { storylineIds: Uuid[]; castIds: Uuid[] },
): Promise<Moment> {
  const { storylineIds, castIds } = tags;
  if (storylineIds.length > MAX_STORYLINE_TAGS) throw new InputError(words.tags.tooManyStorylines);
  if (castIds.length > MAX_CAST_TAGS) throw new InputError(words.tags.tooManyCast);
  if (
    new Set(storylineIds).size !== storylineIds.length ||
    new Set(castIds).size !== castIds.length
  ) {
    throw new InputError(words.tags.unavailable);
  }
  return store.driver.transaction(async (tx) => {
    const moment = await moments.get(tx, momentId);
    if (!moment || moment.deletedAt) throw new InputError(words.tags.unavailable);
    for (const id of storylineIds) {
      const s = await storylines.get(tx, id);
      if (!s || s.deletedAt || s.documentaryId !== moment.documentaryId) {
        throw new InputError(words.tags.unavailable);
      }
    }
    for (const id of castIds) {
      const c = await castMembers.get(tx, id);
      if (!c || c.deletedAt || c.documentaryId !== moment.documentaryId) {
        throw new InputError(words.tags.unavailable);
      }
    }
    return moments.put(
      tx,
      Moment.parse({ ...moment, storylineIds, castIds, updatedAt: clock.now() }),
    );
  });
}
