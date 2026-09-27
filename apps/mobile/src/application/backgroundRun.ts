// One background upload run when no screen is mounted (the system launched the app only for the task):
// it opens the store the way the app does, syncs when signed in, drains the due uploads within the
// budget after a round that worked, and closes the store again.
import type { CaptureServices } from '../domain/capturePorts';
import { openLocalDocumentary } from './bootstrap';
import type { OpenedStore } from './captureContext';
import { syncIfSignedIn } from './sync';
import { drainUploads } from './uploadQueue';

export type BackgroundServices = Pick<CaptureServices, 'account' | 'api' | 'network'>;

export async function runUploadsAlone(
  open: () => Promise<OpenedStore>,
  services: BackgroundServices,
  budgetMs: number,
): Promise<void> {
  const { store, clock, ids, timeZone } = await open();
  try {
    const documentary = await openLocalDocumentary(store, clock, ids, timeZone);
    const outcome = await syncIfSignedIn(store, clock, services.account, services.api, documentary);
    if (outcome?.status !== 'synced') return;
    await drainUploads(store, clock, services.api, services.network, { budgetMs });
  } finally {
    await store.driver.close();
  }
}
