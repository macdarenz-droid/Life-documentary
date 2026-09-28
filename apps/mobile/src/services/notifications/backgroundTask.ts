// The silent push that asks for originals (P16, D42). The task is defined at module scope (the library
// requires it) and this module is imported by the app's entry file through composition/background.ts,
// so a launch with no views mounted still has it. It acts only on our own `{ type: 'originals' }` data:
// through the shared background runner and lock it syncs and queues the requested originals, then drains
// the upload queue with what is left of the budget, skipping the drain when under 5 s remain.
import {
  BackgroundNotificationTaskResult,
  registerTaskAsync,
  type NotificationTaskPayload,
} from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { runInBackground } from '../../application/backgroundRun';

export const ORIGINALS_TASK = 'life-originals';
/** iOS gives a silent push about 30 s; the run keeps within this. */
export const ORIGINALS_BUDGET_MS = 25_000;
/** Less than this left after sync, and the drain waits for the next run. */
export const MIN_DRAIN_MS = 5_000;

/** The push's data: the object itself, or the JSON in `dataString` (UNVERIFIED on a real device). */
function dataOf(payload: object): unknown {
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return undefined;
  const dataString = (data as { dataString?: unknown }).dataString;
  if (typeof dataString !== 'string') return data;
  try {
    return JSON.parse(dataString) as unknown;
  } catch {
    return undefined;
  }
}

/** The one shape this task acts on. */
function isOriginalsPush(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'originals';
}

export async function handleOriginalsPush(
  payload: unknown,
): Promise<BackgroundNotificationTaskResult> {
  // A tap on a notification is not a silent push.
  if (!payload || typeof payload !== 'object' || 'actionIdentifier' in payload) {
    return BackgroundNotificationTaskResult.NoData;
  }
  if (!isOriginalsPush(dataOf(payload))) return BackgroundNotificationTaskResult.NoData;
  try {
    const report = await runInBackground(ORIGINALS_BUDGET_MS, { minDrainMs: MIN_DRAIN_MS });
    return report && (report.queued > 0 || report.uploaded > 0)
      ? BackgroundNotificationTaskResult.NewData
      : BackgroundNotificationTaskResult.NoData;
  } catch (error) {
    console.error('The originals push run failed.', error);
    return BackgroundNotificationTaskResult.Failed;
  }
}

TaskManager.defineTask<NotificationTaskPayload>(ORIGINALS_TASK, ({ data }) =>
  handleOriginalsPush(data),
);

registerTaskAsync(ORIGINALS_TASK).catch((error: unknown) => {
  console.error('The originals push task was not registered.', error);
});
