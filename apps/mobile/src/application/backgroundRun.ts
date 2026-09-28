// Background runs (P6, P16). The upload task and the silent-push task share one runner and one lock:
// the mounted runner while the app's screens are up, otherwise the standalone one, and never two runs
// at once. A standalone run opens the store the way the app does, syncs when signed in, queues what
// open requests ask for (a photo waits for the foreground), drains the due uploads within what is left
// of the budget after a round that worked, and closes the store again.
import type {
  BackgroundReport,
  BackgroundRunner,
  CaptureServices,
  Deadline,
} from '../domain/capturePorts';
import { openLocalDocumentary } from './bootstrap';
import type { OpenedStore } from './captureContext';
import { queueRequestedOriginals } from './originals';
import { syncIfSignedIn } from './sync';
import { drainUploads } from './uploadQueue';

export type BackgroundServices = Pick<CaptureServices, 'account' | 'api' | 'network'>;

let mounted: BackgroundRunner | null = null;
let standalone: BackgroundRunner | null = null;
let tail: Promise<unknown> = Promise.resolve();

/** The runner the mounted screens set once the store is open. */
export function setMountedRunner(run: BackgroundRunner | null): void {
  mounted = run;
}

/** What a run does when no screen has set its runner (a background launch). */
export function setStandaloneRunner(run: BackgroundRunner): void {
  standalone = run;
}

export type RunOptions = { minDrainMs?: number; deadline?: Deadline };

/** What is left of the budget: all of it, or less when a deadline comes first. */
export function timeLeft(budgetMs: number, spentMs: number, deadline?: Deadline): number {
  const left = budgetMs - spentMs;
  return deadline ? Math.min(left, deadline.at - deadline.now()) : left;
}

/**
 * One background run, after any run already going: the mounted runner, else the standalone one. Null
 * when neither is set, or when the deadline passed while it waited. Once it holds the lock, the runner
 * gets only what is left before the deadline.
 */
export function runInBackground(
  budgetMs: number,
  options?: RunOptions,
): Promise<BackgroundReport | void | null> {
  const result = tail.then(() => {
    const run = mounted ?? standalone;
    if (!run) return null;
    const left = timeLeft(budgetMs, 0, options?.deadline);
    if (left <= 0) return null;
    return options ? run(left, options) : run(left);
  });
  tail = result.catch(() => undefined);
  return result;
}

export async function runUploadsAlone(
  open: () => Promise<OpenedStore>,
  services: BackgroundServices,
  budgetMs: number,
  options: RunOptions = {},
): Promise<BackgroundReport> {
  const report: BackgroundReport = { queued: 0, uploaded: 0 };
  const { store, clock, ids, timeZone } = await open();
  try {
    const started = Date.parse(clock.now());
    const documentary = await openLocalDocumentary(store, clock, ids, timeZone);
    const outcome = await syncIfSignedIn(store, clock, services.account, services.api, documentary);
    if (outcome?.status !== 'synced') return report;
    report.queued = (
      await queueRequestedOriginals(store, clock, services.api, { foreground: false })
    ).queued;
    const left = timeLeft(budgetMs, Date.parse(clock.now()) - started, options.deadline);
    if (left <= 0 || left < (options.minDrainMs ?? 0)) return report;
    report.uploaded = (
      await drainUploads(store, clock, services.api, services.network, { budgetMs: left })
    ).uploaded;
    return report;
  } finally {
    await store.driver.close();
  }
}
