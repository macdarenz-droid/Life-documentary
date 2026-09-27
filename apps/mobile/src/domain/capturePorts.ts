// Capture ports (types only). Adapters live in src/services/; screens get them through the capture context.

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
  /** The frame at `atMs`. */
  fromVideo(uri: string, atMs: number): Promise<Poster | null>;
  /** The photo with its longest side at most `maxSide`. */
  fromPhoto(uri: string, maxSide: number): Promise<Poster | null>;
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

/** An audio player with no picture: plays `uri` while `playing` and reports its position. */
export type AudioPlaybackProps = {
  uri: string;
  playing: boolean;
  onEnd: () => void;
  onProgress: (positionMs: number, durationMs: number) => void;
};

/** The services a capture screen uses, except the video recorder that comes from a mounted camera view. */
export type CaptureServices = {
  voice: VoiceRecorder;
  picker: LibraryPicker;
  place: PlaceFinder;
  haptics: Haptics;
  permissions: Permissions;
  settings: SettingsOpener;
  reminders: Reminders;
  posters: PosterMaker;
};
