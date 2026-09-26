// Fake capture services for screen tests and the Design Lab: scripted, recorded, no device.
import type {
  CaptureServices,
  Haptics,
  LibraryPicker,
  PermissionState,
  Permissions,
  PickedMedia,
  PlaceFinder,
  SettingsOpener,
  VideoRecorder,
} from '../../domain/capturePorts';

export type FakeServices = CaptureServices & {
  video: VideoRecorder;
  haptics: Haptics & { calls: ('impactLight' | 'selection')[] };
  picker: LibraryPicker & { next: PickedMedia | null };
  place: PlaceFinder & { name: string | null };
  permissions: Permissions & { set(which: keyof Permissions, state: PermissionState): void };
  settings: SettingsOpener & { opened: number };
  /** Called with the source path a recording "writes"; the test puts fixture bytes there. */
  onRecordingFile?: (path: string) => void;
};

export function fakeServices(
  options: { videoPath?: string; voicePath?: string } = {},
): FakeServices {
  const videoPath = options.videoPath ?? 'tmp/fake-video.mp4';
  const voicePath = options.voicePath ?? 'tmp/fake-voice.m4a';
  const photoPath = 'tmp/fake-photo.jpg';
  const states: Record<keyof Permissions, PermissionState> = {
    camera: 'granted',
    microphone: 'granted',
    location: 'undetermined',
  };
  const permission = (which: keyof Permissions) => ({
    get: async () => states[which],
    request: async () => {
      if (states[which] === 'undetermined') states[which] = 'granted';
      return states[which];
    },
  });

  const services: FakeServices = {
    video: (() => {
      let startedMax = 0;
      return {
        start: async (maxMs: number) => {
          startedMax = maxMs;
        },
        stop: async () => {
          services.onRecordingFile?.(videoPath);
          return {
            uri: videoPath,
            durationMs: Math.min(startedMax, 6000),
            width: 1080,
            height: 1920,
          };
        },
        takePhoto: async () => {
          services.onRecordingFile?.(photoPath);
          return { uri: photoPath, width: 3024, height: 4032 };
        },
      };
    })(),
    voice: {
      start: async () => undefined,
      stop: async () => {
        services.onRecordingFile?.(voicePath);
        return { uri: voicePath, durationMs: 6000 };
      },
    },
    picker: {
      next: null,
      pick: async () => services.picker.next,
    },
    place: {
      name: 'The harbour',
      currentPlaceName: async () => services.place.name,
    },
    haptics: {
      calls: [],
      impactLight: () => services.haptics.calls.push('impactLight'),
      selection: () => services.haptics.calls.push('selection'),
    },
    settings: {
      opened: 0,
      open: () => {
        services.settings.opened += 1;
      },
    },
    permissions: {
      camera: permission('camera'),
      microphone: permission('microphone'),
      location: permission('location'),
      set: (which, state) => {
        states[which] = state;
      },
    },
  };
  return services;
}
