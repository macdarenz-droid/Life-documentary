// Speech to text through the Workers AI binding (D38): the working copy is streamed in with its content
// type, voice activity detection on, and the model detects the language.
import type { TimedSegment, TimedWord, Transcriber } from '../../pipeline/ports';

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
    segments?: WhisperSegment[];
  }>;
};

type WhisperWord = { word?: string; start?: number; end?: number };
type WhisperSegment = { text?: string; start?: number; end?: number; words?: WhisperWord[] };

const ms = (seconds: number) => Math.round(seconds * 1000);

/** A timed piece with its text trimmed, in ms; none when its text is empty or a time is missing. */
function timed(text: string | undefined, start?: number, end?: number): TimedWord | undefined {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '' || start === undefined || end === undefined) return undefined;
  return { text: trimmed, startMs: ms(start), endMs: ms(end) };
}

function segmentsOf(segments: readonly WhisperSegment[]): TimedSegment[] {
  return segments.flatMap((s) => {
    const segment = timed(s.text, s.start, s.end);
    if (!segment) return [];
    const words = (s.words ?? []).flatMap((w) => timed(w.word, w.start, w.end) ?? []);
    return [words.length > 0 ? { ...segment, words } : segment];
  });
}

export function workersAiTranscriber(ai: WhisperBinding): Transcriber {
  return {
    async transcribe({ model, body, contentType }) {
      const out = await ai.run(model, { audio: { body, contentType }, vad_filter: true });
      const language = out.transcription_info?.language;
      const seconds = out.transcription_info?.duration;
      const segments = out.segments ? segmentsOf(out.segments) : [];
      return {
        text: out.text.trim(),
        ...(language ? { language } : {}),
        ...(seconds !== undefined ? { seconds } : {}),
        ...(segments.length > 0 ? { segments } : {}),
      };
    },
  };
}
