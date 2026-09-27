// Everything a Today screen test needs: a memory store, the local documentary, fake services and a fake
// camera, wrapped as a capture context.
import { fakeCameraView } from '../../services/testing/FakeCameraView';
import { fakePlayback } from '../../services/testing/fakePlayback';
import { fakeServices, type FakeServices } from '../../services/testing/fakeServices';
import { openLocalDocumentary } from '../bootstrap';
import type { CaptureContextValue } from '../captureContext';
import { fixedClock, memoryStore, sequentialIds } from './memory';

/** A poster "file": a JPEG signature, then filler. */
export const POSTER_BYTES = new Uint8Array(512).map((_, i) =>
  i < 3 ? [0xff, 0xd8, 0xff][i]! : i & 255,
);

export { JPEG_HEAD, fileWithHead, ftyp } from '../../data/fileStore/testing/containerFixtures';

export const RECORDING_BYTES = new Uint8Array(2048).map((_, i) => (i * 7) & 255);

export async function todayHarness(at = '2027-03-15T09:30:00Z'): Promise<{
  ctx: CaptureContextValue;
  services: FakeServices;
  store: Awaited<ReturnType<typeof memoryStore>>;
}> {
  const store = await memoryStore();
  const clock = fixedClock(at);
  const ids = sequentialIds();
  const documentary = await openLocalDocumentary(store, clock, ids, 'Europe/Berlin');
  const services = fakeServices();
  // A "recording" writes fixture bytes where the recorder says the file is.
  services.onRecordingFile = (path) => store.io.files.set(path, RECORDING_BYTES);
  services.onPosterFile = (path) => store.io.files.set(path, POSTER_BYTES);
  return {
    ctx: {
      store,
      clock,
      ids,
      documentary,
      services,
      CameraView: fakeCameraView(services.video),
      Playback: fakePlayback,
    },
    services,
    store,
  };
}
