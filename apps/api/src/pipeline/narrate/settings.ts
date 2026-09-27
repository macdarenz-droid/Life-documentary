// What the narration step asks the voice (P14, D40). The adapter receives these values and holds none.
import type { Env } from '../../shared/env';

export const NARRATE_MODEL = 'eleven_flash_v2_5';
export const NARRATE_FORMAT = 'mp3_44100_128';
export const NARRATE_LANGUAGE = 'en';

export const VOICES_NOT_SET_UP = 'The narrator voices are not set up';

/** The vendor voice id for one of our narrator ids, from the `NARRATOR_VOICES` secret. */
export function vendorVoice(env: Pick<Env, 'NARRATOR_VOICES'>, ourId: string): string {
  if (!env.NARRATOR_VOICES) throw new Error(VOICES_NOT_SET_UP);
  let voices: unknown;
  try {
    voices = JSON.parse(env.NARRATOR_VOICES);
  } catch {
    throw new Error(VOICES_NOT_SET_UP);
  }
  const voice =
    voices !== null && typeof voices === 'object' && !Array.isArray(voices)
      ? (voices as Record<string, unknown>)[ourId]
      : undefined;
  if (typeof voice !== 'string' || voice.trim() === '') throw new Error(VOICES_NOT_SET_UP);
  return voice;
}
