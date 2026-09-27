// What the understanding step asks the models (P12, D38). The adapters receive these values and hold
// none of them.
export const CAPTION_MODEL = 'claude-haiku-4-5-20251001';
export const TRANSCRIBE_MODEL = '@cf/openai/whisper-large-v3-turbo';

export const CAPTION_SYSTEM =
  'Describe this photo in one plain sentence of at most 25 words, for someone who can\'t see it. Say what is happening and where, when the photo shows it. Call anyone in it "a person", "two people" or "a group of people". Never say who anyone is, and never guess anyone\'s age, gender or feelings. Don\'t copy out private text such as addresses, phone numbers or card numbers. If the photo is too dark or blurred to describe, answer with the one word: unclear';
export const CAPTION_USER_TEXT = 'Describe this photo.';
export const CAPTION_MAX_TOKENS = 200;

/** A transcript is cut to this many characters (the `Derived` contract's limit). */
export const TRANSCRIPT_MAX = 4000;

/** Caption batches: at most this many images and image bytes each; larger images are skipped. */
export const CHUNK_MAX_IMAGES = 100;
export const MB = 1024 * 1024;
export const CHUNK_MAX_BYTES = 12 * MB;
export const IMAGE_MAX_BYTES = 1.5 * MB;

/** The wait for batches: 24 checks 5 minutes apart (2 hours), then up to 6 more after cancelling. */
export const CAPTION_CHECK_EVERY = '5 minutes';
export const CAPTION_CHECKS = 24;
export const CAPTION_ENDING_CHECKS = 6;
