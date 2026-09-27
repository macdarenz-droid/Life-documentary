// Speech to text through the Workers AI binding (D38): the working copy is streamed in with its content
// type, voice activity detection on, and the model detects the language.
import type { Transcriber } from '../../pipeline/ports';

/** The part of the `AI` binding this adapter uses. */
export type WhisperBinding = {
  run(
    model: string,
    inputs: {
      audio: { body: ReadableStream<Uint8Array>; contentType: string };
      vad_filter: boolean;
    },
  ): Promise<{
    text: string;
    transcription_info?: { language?: string; duration?: number };
  }>;
};

export function workersAiTranscriber(ai: WhisperBinding): Transcriber {
  return {
    async transcribe({ model, body, contentType }) {
      const out = await ai.run(model, { audio: { body, contentType }, vad_filter: true });
      const language = out.transcription_info?.language;
      const seconds = out.transcription_info?.duration;
      return {
        text: out.text.trim(),
        ...(language ? { language } : {}),
        ...(seconds !== undefined ? { seconds } : {}),
      };
    },
  };
}
