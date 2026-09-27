// Fake capture services for screen tests and the Design Lab: scripted, recorded, no device.
import {
  Documentary,
  UPLOAD_PART_SIZE,
  Uuid,
  partCountFor,
  type LinkDocumentaryResult,
  type Me,
  type RegisterDevice,
  type SyncRequest,
} from '@life/contracts';
import type {
  Account,
  AccountUser,
  Api,
  CaptureServices,
  Haptics,
  LibraryPicker,
  Network,
  PermissionState,
  Permissions,
  PickedMedia,
  PlaceFinder,
  PosterMaker,
  Reminders,
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
  reminders: Reminders & {
    state: PermissionState;
    /** Scheduled notifications by id. */
    scheduled: Map<string, { hour: number; minute: number; title: string; body: string }>;
    cancelled: string[];
  };
  posters: PosterMaker & {
    /** 'make' writes a poster through onPosterFile; 'none' gives null; 'throw' rejects. */
    mode: 'make' | 'none' | 'throw';
    /** Every call, in order. */
    /** `at` is the frame time for a video and the longest side for a photo. */
    calls: { kind: 'video' | 'photo'; uri: string; at: number; maxSide?: number }[];
  };
  account: Account & {
    /** The person a sign-in signs in as. */
    person: AccountUser;
    /** The code that works; any other is wrong. */
    code: string;
    /** What Apple and Google do: sign in, the person cancels, or the call throws. */
    social: 'signedIn' | 'cancelled' | 'throw';
    signedIn: AccountUser | null;
    sentCodes: string[];
  };
  api: Api & {
    /** The server's owner id for a newly linked documentary. */
    ownerUserId: string;
    failLink: boolean;
    devices: RegisterDevice[];
    linked: Documentary[];
    deletionRequests: number;
    /** The open deletion request `me()` reports, if any. */
    deletion: Me['deletion'];
    deletionCancels: number;
    /** Every sync request, in order; the fake server has nothing to send back. */
    syncs: SyncRequest[];
    /** Every upload call, in order, as `create:<asset>:<purpose>`, `part:<n>` or `complete`. */
    uploads: string[];
  };
  network: Network & { kind: 'wifi' | 'cellular' | 'none' };
  /** Called with the source path a recording "writes"; the test puts fixture bytes there. */
  onRecordingFile?: (path: string) => void;
  /** Called with the path a poster "writes"; the test puts fixture bytes there. */
  onPosterFile?: (path: string) => void;
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

  const person: AccountUser = {
    userId: '0a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d',
    email: 'sam@example.com',
  };

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
    reminders: (() => {
      let next = 0;
      const reminders: FakeServices['reminders'] = {
        state: 'undetermined',
        scheduled: new Map(),
        cancelled: [],
        permission: async () => reminders.state,
        request: async () => {
          if (reminders.state === 'undetermined') reminders.state = 'granted';
          return reminders.state;
        },
        scheduleDaily: async (hour, minute, content) => {
          next += 1;
          const id = `reminder-${next}`;
          reminders.scheduled.set(id, { hour, minute, ...content });
          return id;
        },
        cancel: async (id) => {
          reminders.cancelled.push(id);
          reminders.scheduled.delete(id);
        },
      };
      return reminders;
    })(),
    posters: (() => {
      let next = 0;
      const make = async (kind: 'video' | 'photo', uri: string, at: number, maxSide?: number) => {
        services.posters.calls.push({ kind, uri, at, ...(maxSide !== undefined ? { maxSide } : {}) });
        if (services.posters.mode === 'throw') throw new Error('No poster');
        if (services.posters.mode === 'none') return null;
        next += 1;
        const path = `tmp/fake-poster-${next}.jpg`;
        services.onPosterFile?.(path);
        return { uri: path, width: 270, height: 480 };
      };
      return {
        mode: 'make' as const,
        calls: [],
        fromVideo: (uri: string, atMs: number, maxSide: number) =>
          make('video', uri, atMs, maxSide),
        fromPhoto: (uri: string, maxSide: number) => make('photo', uri, maxSide),
      };
    })(),
    account: {
      person,
      code: '123456',
      social: 'signedIn',
      signedIn: null,
      sentCodes: [],
      session: async () => services.account.signedIn,
      sendCode: async (email) => {
        services.account.sentCodes.push(email);
      },
      signInWithCode: async (_email, code) => {
        if (code !== services.account.code) return 'wrongCode';
        services.account.signedIn = services.account.person;
        return 'signedIn';
      },
      signInWithApple: () => social(),
      signInWithGoogle: () => social(),
      signOut: async () => {
        services.account.signedIn = null;
      },
      cookie: () => (services.account.signedIn ? 'life.session_token=fake' : null),
    },
    api: {
      ownerUserId: person.userId,
      failLink: false,
      devices: [],
      linked: [],
      deletionRequests: 0,
      deletion: null,
      deletionCancels: 0,
      me: async (): Promise<Me> => ({
        userId: Uuid.parse(person.userId),
        email: person.email,
        documentaries: services.api.linked,
        deletion: services.api.deletion,
      }),
      registerDevice: async (device) => {
        services.api.devices.push(device);
        return device;
      },
      linkDocumentary: async (documentary): Promise<LinkDocumentaryResult> => {
        if (services.api.failLink) throw new Error('No network');
        const stored =
          services.api.linked.find((d) => d.id === documentary.id) ??
          Documentary.parse({ ...documentary, ownerUserId: services.api.ownerUserId });
        if (!services.api.linked.includes(stored)) services.api.linked.push(stored);
        return { documentary: stored };
      },
      requestDeletion: async () => {
        services.api.deletionRequests += 1;
        services.account.signedIn = null;
      },
      cancelDeletion: async () => {
        services.api.deletionCancels += 1;
        services.api.deletion = null;
      },
      syncs: [],
      sync: async (request) => {
        services.api.syncs.push(request);
        return { cursor: services.api.syncs.length, changes: [], refused: [] };
      },
      uploads: [],
      createUpload: async (input) => {
        services.api.uploads.push(`create:${input.assetId}:${input.purpose}`);
        return {
          uploadId: `upload-${input.assetId}`,
          partSize: UPLOAD_PART_SIZE,
          partCount: partCountFor(input.bytes),
        };
      },
      uploadPart: async (_assetId, _purpose, partNumber) => {
        services.api.uploads.push(`part:${partNumber}`);
        return { partNumber, etag: `etag-${partNumber}` };
      },
      completeUpload: async (assetId, purpose) => {
        services.api.uploads.push('complete');
        return { cloudKey: `tmp/${assetId}/${purpose}` };
      },
    },
    network: {
      kind: 'wifi',
      connection: async () => services.network.kind,
    },
    device: { platform: 'ios', appVersion: '0.0.0' },
    permissions: {
      camera: permission('camera'),
      microphone: permission('microphone'),
      location: permission('location'),
      set: (which, state) => {
        states[which] = state;
      },
    },
  };
  function social(): Promise<'signedIn' | 'cancelled'> {
    if (services.account.social === 'throw') return Promise.reject(new Error('No network'));
    if (services.account.social === 'signedIn') services.account.signedIn = services.account.person;
    return Promise.resolve(services.account.social);
  }

  return services;
}
