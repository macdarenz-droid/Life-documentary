// The people in a life, named by the person. A name and, if they want, a relation; nothing else is ever
// stored about anyone (CLAUDE.md rule 7). Two people may share a name.
import { CastMember } from '@life/contracts';
import type { Documentary, Uuid } from '@life/contracts';
import { words } from '@life/story';
import * as castMembers from '../data/repositories/castMembers';
import type { SqlDriver } from '../data/sqlite/driver';
import type { Clock, Ids, Store } from './ports';
import { InputError } from './storylines';

export const CAST_TEXT_MAX = 40;

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > CAST_TEXT_MAX) {
    throw new InputError(words.tags.nameInvalid);
  }
  return trimmed;
}

/** A blank relation is no relation. */
function cleanRelation(relation: string | null | undefined): string | undefined {
  const trimmed = relation?.trim() ?? '';
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > CAST_TEXT_MAX) throw new InputError(words.tags.relationInvalid);
  return trimmed;
}

async function live(driver: SqlDriver, id: Uuid): Promise<CastMember> {
  const member = await castMembers.get(driver, id);
  if (!member || member.deletedAt) throw new InputError(words.tags.unavailable);
  return member;
}

/** People not removed, by name. */
export async function listCast(store: Store, documentary: Documentary): Promise<CastMember[]> {
  return castMembers.list(store.driver, documentary.id);
}

export async function addCastMember(
  store: Store,
  clock: Clock,
  ids: Ids,
  documentary: Documentary,
  name: string,
  relation?: string,
): Promise<CastMember> {
  const cleanedName = cleanName(name);
  const cleanedRelation = cleanRelation(relation);
  const now = clock.now();
  return castMembers.put(
    store.driver,
    CastMember.parse({
      id: ids.newId(),
      documentaryId: documentary.id,
      name: cleanedName,
      ...(cleanedRelation !== undefined ? { relation: cleanedRelation } : {}),
      createdAt: now,
      updatedAt: now,
    }),
  );
}

export async function renameCastMember(
  store: Store,
  clock: Clock,
  id: Uuid,
  name: string,
): Promise<CastMember> {
  const cleaned = cleanName(name);
  return store.driver.transaction(async (tx) => {
    const member = await live(tx, id);
    return castMembers.put(
      tx,
      CastMember.parse({ ...member, name: cleaned, updatedAt: clock.now() }),
    );
  });
}

export async function setRelation(
  store: Store,
  clock: Clock,
  id: Uuid,
  relation: string | null,
): Promise<CastMember> {
  const cleaned = cleanRelation(relation);
  return store.driver.transaction(async (tx) => {
    const member = await live(tx, id);
    const next: CastMember = { ...member, updatedAt: clock.now() };
    if (cleaned === undefined) delete next.relation;
    else next.relation = cleaned;
    return castMembers.put(tx, CastMember.parse(next));
  });
}

export async function removeCastMember(store: Store, clock: Clock, id: Uuid): Promise<CastMember> {
  return store.driver.transaction(async (tx) => {
    const member = await live(tx, id);
    const now = clock.now();
    return castMembers.put(tx, CastMember.parse({ ...member, deletedAt: now, updatedAt: now }));
  });
}
