// First launch: the device keeps one local documentary. P4 links its local owner id to an account.
import { Documentary } from '@life/contracts';
import { words } from '@life/story';
import * as documentaries from '../data/repositories/documentaries';
import type { Clock, Ids, Store } from './ports';

/** Returns the local documentary, creating it (and a local user id) on first run. */
export async function openLocalDocumentary(
  store: Store,
  clock: Clock,
  ids: Ids,
  timeZone: string,
): Promise<Documentary> {
  return store.driver.transaction(async (tx) => {
    const [existing] = await documentaries.listAll(tx);
    if (existing) return existing;
    const now = clock.now();
    return documentaries.put(
      tx,
      Documentary.parse({
        id: ids.newId(),
        ownerUserId: ids.newId(),
        title: words.documentary.defaultTitle,
        kind: 'solo',
        timeZone,
        createdAt: now,
        updatedAt: now,
      }),
    );
  });
}
