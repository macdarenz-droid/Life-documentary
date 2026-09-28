// The background upload task over expo-background-task. The task is defined at module scope (the
// library requires it) and this module is imported by the app's entry file, so a background launch
// with no views mounted still has it. It runs through the shared background runner and lock
// (application/backgroundRun.ts): the mounted runner while the app's screens are up, otherwise the
// standalone one, never at the same time as the silent-push task. Registered after sign-in with the
// shortest interval the system allows.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runInBackground, setMountedRunner } from '../../application/backgroundRun';
import type { BackgroundUploads } from '../../domain/capturePorts';

export { setStandaloneRunner } from '../../application/backgroundRun';

export const UPLOAD_TASK = 'life-uploads';
/** Minutes between runs; iOS decides when it actually runs. */
const MINIMUM_INTERVAL = 15;
/** One run stops starting new parts after this long. */
const BUDGET_MS = 25_000;

TaskManager.defineTask(UPLOAD_TASK, async () => {
  try {
    await runInBackground(BUDGET_MS);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('The background upload run failed.', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const expoBackgroundUploads: BackgroundUploads = {
  setRunner: (run) => setMountedRunner(run),
  register: async () => {
    if (await TaskManager.isTaskRegisteredAsync(UPLOAD_TASK)) return;
    await BackgroundTask.registerTaskAsync(UPLOAD_TASK, { minimumInterval: MINIMUM_INTERVAL });
  },
};
