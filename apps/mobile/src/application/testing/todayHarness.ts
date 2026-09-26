// Everything a Today screen test needs: a memory store, the local documentary, fake services and a fake
// camera, wrapped as a capture context.
import { fakeCameraView } from '../../services/testing/FakeCameraView';
import { fakeServices, type FakeServices } from '../../services/testing/fakeServices';
import { openLocalDocumentary } from '../bootstrap';
import type { CaptureContextValue } from '../captureContext';
import { fixedClock, memoryStore, sequentialIds } from './memory';

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
  return {
    ctx: { store, clock, ids, documentary, services, CameraView: fakeCameraView(services.video) },
    services,
    store,
  };
}
