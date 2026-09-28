// Imported first by the app's entry file (index.ts): defines the background upload task and the
// silent-push task for originals (P16), and gives them a runner of their own for a launch where no
// screen mounts.
import { runUploadsAlone, setStandaloneRunner } from '../application/backgroundRun';
import '../services/background/uploadTask';
import '../services/notifications/backgroundTask';
import { expoNetwork } from '../services/network/expoNetwork';
import { account, api, openDeviceStore } from './device';

setStandaloneRunner((budgetMs, options) =>
  runUploadsAlone(openDeviceStore, { account, api, network: expoNetwork }, budgetMs, options),
);
