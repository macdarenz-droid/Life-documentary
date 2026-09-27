import { runUploadsAlone } from '../../application/backgroundRun';
import { openLocalDocumentary } from '../../application/bootstrap';
import { captureMoment } from '../../application/captureMoment';
import { enqueueUploads } from '../../application/enqueueUploads';
import { fakeSyncApi } from '../../application/testing/fakeSyncApi';
import { fakeUploadApi } from '../../application/testing/fakeUploadApi';
import { fixedClock, memoryStore, sequentialIds } from '../../application/testing/memory';
import { todayQuestion } from '../../application/todayQuestion';
import type { Account, Network, PosterMaker } from '../../domain/capturePorts';
import { expoBackgroundUploads, setStandaloneRunner } from './uploadTask';

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: async () => true,
}));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: async () => undefined,
}));

/** The task body as the module defined it. */
function taskBody(): () => Promise<number> {
  const { defineTask } = jest.requireMock<{ defineTask: jest.Mock }>('expo-task-manager');
  const call = defineTask.mock.calls.find(([name]) => name === 'life-uploads');
  return call![1];
}

const SOURCE = 'tmp/source';
const M4A = new Uint8Array([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 1, 2, 3,
]);

/** A phone with one voice answer waiting to go up, and a signed-in account. */
async function phone() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-15T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  store.io.files.set(SOURCE, M4A);
  const question = await todayQuestion(store, documentary, clock, ids);
  const moment = await captureMoment(store, clock, ids, {
    kind: 'answer',
    questionId: question.id,
    media: { sourcePath: SOURCE, mediaKind: 'audio', durationMs: 9000 },
    localOnly: false,
  });
  const posters: PosterMaker = { fromVideo: async () => null, fromPhoto: async () => null };
  await enqueueUploads(store, clock, posters, moment.id);
  const uploads = fakeUploadApi();
  const syncs = fakeSyncApi();
  const api = { ...uploads, sync: syncs.sync };
  const account = {
    cookie: () => 'better-auth.session_token=tok',
    session: async () => null,
  } as unknown as Account;
  const network: Network = { connection: async () => 'cellular' };
  const open = async () => ({ store, clock, ids, timeZone: 'Europe/Berlin' });
  return { store, moment, uploads, syncs, api, account, network, open };
}

describe('the background upload task', () => {
  it('opens the store, syncs and drains a due job when no screen set a runner', async () => {
    const p = await phone();
    const close = jest.spyOn(p.store.driver, 'close');
    setStandaloneRunner((budgetMs) =>
      runUploadsAlone(p.open, { account: p.account, api: p.api, network: p.network }, budgetMs),
    );
    expect(await taskBody()()).toBe(1);
    expect(p.syncs.sent).toHaveLength(1);
    expect(p.uploads.calls).toEqual(['create:answer', 'part:1', 'complete:answer']);
    expect(p.uploads.objects.get(`${p.moment.mediaAssetId}/answer`)).toEqual(M4A);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('runs the mounted runner instead while the screens are up', async () => {
    const standalone = jest.fn(async () => undefined);
    const mounted = jest.fn(async () => undefined);
    setStandaloneRunner(standalone);
    expoBackgroundUploads.setRunner(mounted);
    expect(await taskBody()()).toBe(1);
    expect(mounted).toHaveBeenCalledWith(25_000);
    expect(standalone).not.toHaveBeenCalled();
  });
});
