import { words } from '@life/story';
import { OriginalRequest, Uuid } from '@life/contracts';
import { render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import * as originalRequests from '../data/repositories/originalRequests';
import * as uploadJobs from '../data/repositories/uploadJobs';
import { migrate } from '../data/migrations';
import { openMemoryDriver } from '../data/sqlite/testing/memoryDriver';
import { fakeCameraView } from '../services/testing/FakeCameraView';
import { fakeServices } from '../services/testing/fakeServices';
import { openLocalDocumentary } from './bootstrap';
import { CaptureRoot, useCapture, type OpenedStore } from './captureContext';
import { captureMoment } from './captureMoment';
import { fixedClock, memoryStore, sequentialIds } from './testing/memory';

function Title() {
  const { documentary } = useCapture();
  return <Text>{documentary.title}</Text>;
}

describe('CaptureRoot', () => {
  it('renders its children with the local documentary once the store is open', async () => {
    const open = async (): Promise<OpenedStore> => ({
      store: await memoryStore(),
      clock: fixedClock('2027-03-15T09:30:00Z'),
      ids: sequentialIds(),
      timeZone: 'Europe/Berlin',
    });
    const services = fakeServices();
    await render(
      <CaptureRoot open={open} services={services} CameraView={fakeCameraView(services.video)}>
        <Title />
      </CaptureRoot>,
    );
    expect(await screen.findByText(words.documentary.defaultTitle)).toBeOnTheScreen();
  });

  it('removes plain upload copies a killed run left behind', async () => {
    const store = await memoryStore();
    store.io.files.set('cache/uploads/left-over.answer.upload', new Uint8Array([1, 2, 3]));
    const open = async (): Promise<OpenedStore> => ({
      store,
      clock: fixedClock('2027-03-15T09:30:00Z'),
      ids: sequentialIds(),
      timeZone: 'Europe/Berlin',
    });
    const services = fakeServices();
    await render(
      <CaptureRoot open={open} services={services} CameraView={fakeCameraView(services.video)}>
        <Title />
      </CaptureRoot>,
    );
    expect(await screen.findByText(words.documentary.defaultTitle)).toBeOnTheScreen();
    expect(store.io.files.has('cache/uploads/left-over.answer.upload')).toBe(false);
  });

  it('shows the opening error words when migrate throws', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const open = async (): Promise<OpenedStore> => {
      await migrate(await openMemoryDriver(), '2027-03-15T09:30:00Z', [
        { version: 2, name: 'gap', sql: '' },
      ]);
      throw new Error('unreachable');
    };
    const services = fakeServices();
    await render(
      <CaptureRoot open={open} services={services} CameraView={fakeCameraView(services.video)}>
        <Title />
      </CaptureRoot>,
    );
    expect(await screen.findByText(words.permissions.openError)).toBeOnTheScreen();
    expect(screen.queryByText(words.documentary.defaultTitle)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  let afterRestore: (() => void) | null = null;
  afterEach(() => {
    afterRestore?.();
    afterRestore = null;
  });

  it.each([
    ['background', false],
    ['active', true],
  ] as const)(
    'makes the JPEG copy of a requested photo on mount only when the app is active (%s)',
    async (appState, copied) => {
      // The React Native mock has a function here; the app reads a string.
      const original = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
      Object.defineProperty(AppState, 'currentState', { value: appState, configurable: true });
      afterRestore = () => Object.defineProperty(AppState, 'currentState', original);
      const store = await memoryStore();
      const clock = fixedClock('2027-03-15T09:30:00Z');
      const ids = sequentialIds();
      const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
      store.io.files.set(
        'tmp/photo.jpg',
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]),
      );
      const photo = await captureMoment(store, clock, ids, {
        kind: 'photo',
        media: { sourcePath: 'tmp/photo.jpg', mediaKind: 'photo', width: 4000, height: 3000 },
        localOnly: false,
      });
      await originalRequests.put(
        store.driver,
        OriginalRequest.parse({
          id: Uuid.parse('00000000-0000-4000-8000-0000000004a1'),
          episodeId: Uuid.parse('00000000-0000-4000-8000-0000000004e1'),
          documentaryId: documentary.id,
          momentId: photo.id,
          assetId: photo.mediaAssetId,
          state: 'open',
          createdAt: '2027-03-15T09:00:00Z',
          updatedAt: '2027-03-15T09:00:00Z',
        }),
      );
      const services = fakeServices();
      services.account.signedIn = services.account.person;
      services.onPosterFile = (path) => store.io.files.set(path, new Uint8Array([0xff, 0xd8, 9]));
      const open = async (): Promise<OpenedStore> => ({
        store,
        clock,
        ids,
        timeZone: 'Europe/Berlin',
      });
      await render(
        <CaptureRoot open={open} services={services} CameraView={fakeCameraView(services.video)}>
          <Title />
        </CaptureRoot>,
      );
      await waitFor(() => expect(services.api.syncs.length).toBeGreaterThan(0));
      // The round goes on to queue the originals and drain; let it finish.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const fullSize = services.posters.calls.filter(
        (c) => c.kind === 'photo' && c.at === Number.MAX_SAFE_INTEGER,
      );
      expect(fullSize).toHaveLength(copied ? 1 : 0);
      expect(!!(await uploadJobs.get(store.driver, photo.mediaAssetId!, 'original'))).toBe(copied);
    },
  );
});
