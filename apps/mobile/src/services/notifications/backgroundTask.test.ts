import { OriginalRequest, Uuid } from '@life/contracts';
import { runUploadsAlone, setStandaloneRunner } from '../../application/backgroundRun';
import { openLocalDocumentary } from '../../application/bootstrap';
import { captureMoment } from '../../application/captureMoment';
import { fakeSyncApi } from '../../application/testing/fakeSyncApi';
import { fakeUploadApi } from '../../application/testing/fakeUploadApi';
import { fixedClock, memoryStore, sequentialIds } from '../../application/testing/memory';
import type { Account, Network } from '../../domain/capturePorts';
// The upload task defines its body on the same TaskManager mock.
import '../background/uploadTask';
import { handleOriginalsPush, MIN_DRAIN_MS, ORIGINALS_BUDGET_MS } from './backgroundTask';

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: async () => true,
}));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: async () => undefined,
}));
jest.mock('expo-notifications', () => ({
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
  registerTaskAsync: jest.fn(async () => null),
}));

const NEW_DATA = 0;
const NO_DATA = 1;

/** A task body defined at module scope by `name`. */
function taskBody(name: string): (...args: unknown[]) => Promise<number> {
  const { defineTask } = jest.requireMock<{ defineTask: jest.Mock }>('expo-task-manager');
  const call = defineTask.mock.calls.find(([n]) => n === name);
  return call![1];
}

const SOURCE = 'tmp/source';
const MOV = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 9, 9]);
const T = '2027-03-21T06:00:00.000Z';
const push = (data: unknown) => ({ notification: null, data });

/** A signed-in phone with a clip the server asked for. */
async function phone() {
  const store = await memoryStore();
  const clock = fixedClock('2027-03-21T09:30:00Z');
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  store.io.files.set(SOURCE, MOV);
  const clip = await captureMoment(store, clock, ids, {
    kind: 'clip',
    media: { sourcePath: SOURCE, mediaKind: 'video', durationMs: 9000, width: 1080, height: 1920 },
    localOnly: false,
  });
  const uploads = fakeUploadApi();
  const syncs = fakeSyncApi();
  syncs.seed({
    entity: 'originalRequest',
    row: OriginalRequest.parse({
      id: Uuid.parse('00000000-0000-4000-8000-0000000003a1'),
      episodeId: Uuid.parse('00000000-0000-4000-8000-0000000003e1'),
      documentaryId: documentary.id,
      momentId: clip.id,
      assetId: clip.mediaAssetId,
      state: 'open',
      createdAt: T,
      updatedAt: T,
    }),
  });
  const api = { ...uploads, sync: syncs.sync };
  const account = {
    cookie: () => 'better-auth.session_token=tok',
    session: async () => null,
  } as unknown as Account;
  const network: Network = { connection: async () => 'wifi' };
  const open = async () => ({ store, clock, ids, timeZone: 'Europe/Berlin' });
  setStandaloneRunner((budgetMs, options) =>
    runUploadsAlone(open, { account, api, network }, budgetMs, options),
  );
  return { store, clock, clip, uploads, syncs, api };
}

describe('the silent-push task for originals', () => {
  it('syncs, queues and drains for a dataString payload, within its budget', async () => {
    const p = await phone();
    const result = await handleOriginalsPush(
      push({ dataString: JSON.stringify({ type: 'originals' }) }),
    );
    expect(result).toBe(NEW_DATA);
    expect(p.syncs.sent.length).toBeGreaterThan(0);
    expect(p.uploads.calls).toEqual(['create:original', 'part:1', 'complete:original']);
    expect(p.uploads.objects.get(`${p.clip.mediaAssetId}/original`)).toEqual(MOV);
  });

  it('skips the drain when under 5 s of the budget are left after sync', async () => {
    const p = await phone();
    const sync = p.api.sync;
    p.api.sync = async (request) => {
      p.clock.set('2027-03-21T09:30:21Z');
      return sync(request);
    };
    expect(ORIGINALS_BUDGET_MS - 21_000).toBeLessThan(MIN_DRAIN_MS);
    expect(await handleOriginalsPush(push({ type: 'originals' }))).toBe(NEW_DATA);
    expect(p.uploads.calls).toEqual([]);
  });

  it('returns NoData for any other payload, and for a tapped notification', async () => {
    const p = await phone();
    expect(await handleOriginalsPush(push({ type: 'episode', episodeId: 'x' }))).toBe(NO_DATA);
    expect(await handleOriginalsPush(push({ dataString: 'not json' }))).toBe(NO_DATA);
    expect(
      await handleOriginalsPush({
        actionIdentifier: 'default',
        notification: {},
        data: { type: 'originals' },
      }),
    ).toBe(NO_DATA);
    expect(p.syncs.sent).toEqual([]);
  });

  it('never runs at the same time as the background upload task', async () => {
    let active = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    setStandaloneRunner(async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return { queued: 1, uploaded: 0 };
    });
    const uploadRun = taskBody('life-uploads')();
    const pushRun = handleOriginalsPush(push({ type: 'originals' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(releases).toHaveLength(1);
    releases[0]!();
    await uploadRun;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(releases).toHaveLength(2);
    releases[1]!();
    expect(await pushRun).toBe(NEW_DATA);
    expect(most).toBe(1);
  });
});
