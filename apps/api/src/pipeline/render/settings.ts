// Render policy (P15, D41): how long a media URL lives, which composition draws the episode, and what the
// renderer is asked for. Providers receive these values and hold none.
import type { RenderOptions } from '../ports';

/** A presigned GET URL for the renderer lives 15 minutes (ARCHITECTURE §7). */
export const PRESIGN_SECONDS = 900;

export const RENDER_COMPOSITION = 'Episode';

export const RENDER_OPTIONS: RenderOptions = {
  codec: 'h264',
  imageFormat: 'jpeg',
  privacy: 'no-acl',
  maxRetries: 1,
  timeoutInMilliseconds: 60_000,
  logLevel: 'warn',
  deleteAfter: '1-day',
};

/** A render input larger than this is refused (the synchronous invoke limit, with room to spare). */
export const MAX_INPUT_BYTES = 200_000;

/** Photo originals Chrome can draw; anything else (HEIC, for one) is left out until P16 asks for a JPEG. */
export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
