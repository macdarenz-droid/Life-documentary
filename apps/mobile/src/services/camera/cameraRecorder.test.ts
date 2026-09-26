import { createCameraRecorder, type RecordingView } from './cameraRecorder';

function fakeView() {
  let finish: (value: { uri: string } | undefined) => void = () => undefined;
  const view: RecordingView & { stopped: number } = {
    stopped: 0,
    recordAsync: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    stopRecording: () => {
      view.stopped += 1;
      finish({ uri: 'file:///rec.mov' });
    },
    takePictureAsync: async () => ({ uri: 'file:///still.jpg', width: 3024, height: 4032 }),
  };
  return { view, capAt: () => finish({ uri: 'file:///rec.mov' }) };
}

describe('createCameraRecorder', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reports the file's duration and size, not the time between start and stop", async () => {
    const { view, capAt } = fakeView();
    const readMetadata = jest.fn(async () => ({ durationMs: 10_000, width: 1080, height: 1920 }));
    const recorder = createCameraRecorder(() => view, readMetadata);
    await recorder.start(10_000);
    // The camera stops itself at the 10 s cap; the finger lifts at 12 s.
    jest.advanceTimersByTime(10_000);
    capAt();
    jest.advanceTimersByTime(2_000);
    expect(await recorder.stop()).toEqual({
      uri: 'file:///rec.mov',
      durationMs: 10_000,
      width: 1080,
      height: 1920,
    });
    expect(readMetadata).toHaveBeenCalledWith('file:///rec.mov');
  });

  it('gives null when the file cannot be read', async () => {
    const { view } = fakeView();
    const recorder = createCameraRecorder(
      () => view,
      async () => null,
    );
    await recorder.start(10_000);
    expect(await recorder.stop()).toBeNull();
    expect(view.stopped).toBe(1);
  });

  it('takes a still with the size the camera reports', async () => {
    const { view } = fakeView();
    const recorder = createCameraRecorder(
      () => view,
      async () => null,
    );
    expect(await recorder.takePhoto()).toEqual({
      uri: 'file:///still.jpg',
      width: 3024,
      height: 4032,
    });
  });

  it('gives null when nothing was recorded', async () => {
    const { view } = fakeView();
    const recorder = createCameraRecorder(
      () => view,
      async () => ({ durationMs: 1, width: 1, height: 1 }),
    );
    expect(await recorder.stop()).toBeNull();
  });
});
