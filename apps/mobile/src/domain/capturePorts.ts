// Capture ports (types only). Adapters live in src/services/; screens get them through the capture context.

/** Provided by a mounted camera view (CameraRecorderView). */
export interface VideoRecorder {
  start(maxMs: number): Promise<void>;
  stop(): Promise<{ uri: string; durationMs: number; width: number; height: number } | null>;
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

/** The services a capture screen uses, except the video recorder that comes from a mounted camera view. */
export type CaptureServices = {
  voice: VoiceRecorder;
  picker: LibraryPicker;
  place: PlaceFinder;
  haptics: Haptics;
  permissions: Permissions;
};
