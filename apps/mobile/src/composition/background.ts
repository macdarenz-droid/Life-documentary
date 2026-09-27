// Imported first by the app's entry file (index.ts): defines the background upload task and gives it a
// runner of its own for a launch where no screen mounts.
import { runUploadsAlone } from '../application/backgroundRun';
import { setStandaloneRunner } from '../services/background/uploadTask';
import { expoNetwork } from '../services/network/expoNetwork';
import { account, api, openDeviceStore } from './device';

setStandaloneRunner((budgetMs) =>
  runUploadsAlone(openDeviceStore, { account, api, network: expoNetwork }, budgetMs),
);
