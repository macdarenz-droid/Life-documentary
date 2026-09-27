// The background upload task over expo-background-task. The task is defined at module scope (the
// library requires it) and this module is imported by the app's entry file, so a background launch
// with no views mounted still has it. While the app's screens are up, the mounted runner (set once the
// store is open) does the work; otherwise the standalone runner opens the store itself. Either gets a
// limited time budget. Registered after sign-in with the shortest interval the system allows.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import type { BackgroundUploads } from '../../domain/capturePorts';

export const UPLOAD_TASK = 'life-uploads';
/** Minutes between runs; iOS decides when it actually runs. */
const MINIMUM_INTERVAL = 15;
/** One run stops starting new parts after this long. */
const BUDGET_MS = 25_000;

type Runner = (budgetMs: number) => Promise<void>;

let runner: Runner | null = null;
let standalone: Runner | null = null;

/** What a run does when no screen has set its runner (a background launch). */
export function setStandaloneRunner(run: Runner): void {
  standalone = run;
}

TaskManager.defineTask(UPLOAD_TASK, async () => {
  const run = runner ?? standalone;
  if (!run) return BackgroundTask.BackgroundTaskResult.Success;
  try {
    await run(BUDGET_MS);
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
