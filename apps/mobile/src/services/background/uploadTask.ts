// The background upload task over expo-background-task. The task is defined at module scope (the
// library requires it); what it runs is set by the composition root once the store is open, and it
// gets a limited time budget. Registered after sign-in with the shortest interval the system allows.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import type { BackgroundUploads } from '../../domain/capturePorts';

export const UPLOAD_TASK = 'life-uploads';
/** Minutes between runs; iOS decides when it actually runs. */
const MINIMUM_INTERVAL = 15;
/** One run stops starting new parts after this long. */
const BUDGET_MS = 25_000;

let runner: ((budgetMs: number) => Promise<void>) | null = null;

TaskManager.defineTask(UPLOAD_TASK, async () => {
  if (!runner) return BackgroundTask.BackgroundTaskResult.Success;
  try {
    await runner(BUDGET_MS);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('The background upload run failed.', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const expoBackgroundUploads: BackgroundUploads = {
  setRunner: (run) => {
    runner = run;
  },
  register: async () => {
    if (await TaskManager.isTaskRegisteredAsync(UPLOAD_TASK)) return;
    await BackgroundTask.registerTaskAsync(UPLOAD_TASK, { minimumInterval: MINIMUM_INTERVAL });
  },
};
