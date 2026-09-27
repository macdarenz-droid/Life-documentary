// Speech through ElevenLabs' text-to-speech with timestamps (P14, D40), with raw `fetch` (the SDK brings
// Node-only dependencies). It sends the voice, text, model, format and language it is given, and reports
// the audio, the character alignment and the billed characters. It decides nothing.
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type { Narrator, SpeechAlignment } from '../../pipeline/ports';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';

// Unknown fields are ignored (ElevenLabs' API terms ask clients to parse leniently).
const AlignmentBody = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});
const SpeechBody = z.object({
  audio_base64: z.string(),
  alignment: AlignmentBody.nullish(),
});

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function elevenlabsNarrator(apiKey: string, fetcher: Fetch = fetch): Narrator {
  return {
    async speak({ voiceId, text, modelId, outputFormat, languageCode }) {
      const url = `${API}/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: modelId, language_code: languageCode }),
      });
      if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}.`);
      const body = SpeechBody.safeParse(await response.json());
      if (!body.success) throw new Error('ElevenLabs answered with a body that could not be read.');
      const a = body.data.alignment;
      const alignment: SpeechAlignment | null = a
        ? {
            characters: a.characters,
            startSeconds: a.character_start_times_seconds,
            endSeconds: a.character_end_times_seconds,
          }
        : null;
      const billed = Number(response.headers.get('character-cost'));
      return {
        audio: new Uint8Array(Buffer.from(body.data.audio_base64, 'base64')),
        alignment,
        characters:
          Number.isInteger(billed) && billed >= 0 && response.headers.has('character-cost')
            ? billed
            : text.length,
      };
    },
  };
}
