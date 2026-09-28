// Capture ports (types only). Adapters live in src/services/; screens get them through the capture context.
import type {
  CreateUpload,
  CreateUploadResult,
  Documentary,
  LinkDocumentaryResult,
  Me,
  RegisterDevice,
  SyncRequest,
  SyncResponse,
  UploadDone,
  UploadPurpose,
  UploadedPart,
} from '@life/contracts';

/** Provided by a mounted camera view (CameraRecorderView). */
export interface VideoRecorder {
  start(maxMs: number): Promise<void>;
  stop(): Promise<{ uri: string; durationMs: number; width: number; height: number } | null>;
  /** A still from the same camera; null when nothing was taken. */
  takePhoto(): Promise<{ uri: string; width: number; height: number } | null>;
}

export interface VoiceRecorder {
  start(maxMs: number): Promise<void>;
  stop(): Promise<{ uri: string; durationMs: number } | null>;
}

export type PickedMedia = {
  uri: string;
  kind: 'video' | 'photo';
  width: number;
  height: number;
  durationMs?: number;
};

export interface LibraryPicker {
  pick(): Promise<PickedMedia | null>;
}

/** A place name only; coordinates never leave the adapter. */
export interface PlaceFinder {
  currentPlaceName(): Promise<string | null>;
}

export interface Haptics {
  impactLight(): void;
  selection(): void;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface Permission {
  get(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
}

export interface Permissions {
  camera: Permission;
  microphone: Permission;
  location: Permission;
}

/** Opens the app's page in the system Settings. */
export interface SettingsOpener {
  open(): void;
}

/** Local notifications: the one daily reminder, scheduled on the device with no account or network. */
export interface Reminders {
  permission(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
  /** Schedules a notification every day at hour:minute; returns its id. */
  scheduleDaily(
    hour: number,
    minute: number,
    content: { title: string; body: string },
  ): Promise<string>;
  cancel(id: string): Promise<void>;
}

export type Poster = { uri: string; width: number; height: number };

/** Makes a small JPEG poster in the app cache; null when it cannot be made. */
export interface PosterMaker {
  /** The frame at `atMs`, its longest side at most `maxSide`, as a JPEG of `quality` (0 to 1). */
  fromVideo(uri: string, atMs: number, maxSide: number, quality?: number): Promise<Poster | null>;
  /** The photo with its longest side at most `maxSide`, as a JPEG of `quality` (0 to 1). */
  fromPhoto(uri: string, maxSide: number, quality?: number): Promise<Poster | null>;
}

/** The props every camera view (the Expo one or a fake) accepts. */
export type CameraViewProps = {
  onRecorder: (recorder: VideoRecorder | null) => void;
  style?: unknown;
  /** Which camera to use; each view has its own default. */
  facing?: 'front' | 'back';
  /** 'picture' for stills, 'video' (the default) for recordings. */
  mode?: 'picture' | 'video';
};

/** A video player view: plays `uri` once with sound while `playing`, and holds its last frame at the end. */
export type VideoPlaybackProps = {
  uri: string;
  playing: boolean;
  onEnd: () => void;
  style?: unknown;
};

/** Where the episode player reads from: a local plain file, or the route with the session header. */
export type EpisodeSource = { uri: string; headers?: Record<string, string> };

/** The full-screen episode player (P16): native controls, no picture in picture. */
export type EpisodePlaybackProps = {
  source: EpisodeSource;
  /** The accessible label. */
  label: string;
  style?: unknown;
};

/** An audio player with no picture: plays `uri` while `playing` and reports its position. */
export type AudioPlaybackProps = {
  uri: string;
  playing: boolean;
  onEnd: () => void;
  onProgress: (positionMs: number, durationMs: number) => void;
};

/** The signed-in person, as the session says. */
export type AccountUser = { userId: string; email: string };

/** How a sign-in ended; anything else (no network, the server refusing) throws. */
export type SignInResult = 'signedIn' | 'wrongCode' | 'cancelled';

/** The account session (P4): Better Auth on the phone, the session kept in the secure store. */
export interface Account {
  session(): Promise<AccountUser | null>;
  sendCode(email: string): Promise<void>;
  signInWithCode(email: string, code: string): Promise<SignInResult>;
  signInWithApple(): Promise<SignInResult>;
  signInWithGoogle(): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** The session cookie for API calls; null when signed out. */
  cookie(): string | null;
}

/** A request the server answered with an error status; `status` says which. */
export class ApiRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRefused';
  }
}

/** The Worker's account API; every response is parsed with the contracts. */
export interface Api {
  me(): Promise<Me>;
  registerDevice(device: RegisterDevice): Promise<RegisterDevice>;
  linkDocumentary(documentary: Documentary): Promise<LinkDocumentaryResult>;
  requestDeletion(): Promise<void>;
  cancelDeletion(): Promise<void>;
  /** POST /sync: pushes changed rows and pulls what changed after the cursor (P6). */
  sync(request: SyncRequest): Promise<SyncResponse>;
  /** POST /uploads: starts an upload, or gives back the one already open for this asset and purpose. */
  createUpload(input: CreateUpload): Promise<CreateUploadResult>;
  /** PUT one part's bytes. */
  uploadPart(
    assetId: string,
    purpose: UploadPurpose,
    partNumber: number,
    bytes: Uint8Array,
  ): Promise<UploadedPart>;
  completeUpload(
    assetId: string,
    purpose: UploadPurpose,
    parts: UploadedPart[],
  ): Promise<UploadDone>;
  /** DELETE /uploads/:assetId/:purpose: gives up an open upload; one that is not there is fine. */
  abortUpload(assetId: string, purpose: UploadPurpose): Promise<void>;
}

/** How the phone is connected right now; uploads of video wait for Wi-Fi. */
export interface Network {
  connection(): Promise<'wifi' | 'cellular' | 'none'>;
}

/** What one background run did (P16): originals queued and files sent. */
export type BackgroundReport = { queued: number; uploaded: number };

/** A fixed end for a run, on the clock that set it (milliseconds since the epoch). */
export type Deadline = { at: number; now: () => number };

/**
 * One background run with its time budget in milliseconds. With `minDrainMs`, the drain after sync is
 * skipped when less than that is left of the budget. With `deadline`, what is left is also measured
 * against it, so time spent opening the store counts.
 */
export type BackgroundRunner = (
  budgetMs: number,
  options?: { minDrainMs?: number; deadline?: Deadline },
) => Promise<BackgroundReport | void>;

/** The system's background task for uploads: registered after sign-in, it runs `run` when it fires. */
export interface BackgroundUploads {
  /** What one background run does. */
  setRunner(run: BackgroundRunner): void;
  register(): Promise<void>;
}

/** This phone's Expo push token (P16): null unless notifications are allowed and the app has a project id. */
export interface PushTokens {
  current(): Promise<string | null>;
}

/** What the phone says about itself when it registers. */
export type DeviceInfo = { platform: 'ios' | 'android'; appVersion: string };

/** Sign in with Apple's own button (Apple requires it); only on iPhone. */
export type AppleButtonProps = { onPress: () => void };

/** The services a capture screen uses, except the video recorder that comes from a mounted camera view. */
/**
 * An episode's video from the service (P16, D42): `GET /episodes/:id/video` with the session cookie.
 * `download` writes `<dest>.part` and moves it to `dest` only when it worked; on failure it deletes the
 * part and throws. `stream` is null when signed out.
 */
export interface EpisodeFiles {
  download(episodeId: string, dest: string): Promise<void>;
  stream(episodeId: string): EpisodeSource | null;
}

export type CaptureServices = {
  voice: VoiceRecorder;
  picker: LibraryPicker;
  place: PlaceFinder;
  haptics: Haptics;
  permissions: Permissions;
  settings: SettingsOpener;
  reminders: Reminders;
  posters: PosterMaker;
  account: Account;
  api: Api;
  device: DeviceInfo;
  network: Network;
  /** Absent where there is no background task (tests, the Design Lab). */
  background?: BackgroundUploads;
  /** Absent where there is no push (tests, the Design Lab, the web preview). */
  pushTokens?: PushTokens;
  /** Absent where episodes cannot be fetched (the Design Lab, the web preview). */
  episodes?: EpisodeFiles;
};
