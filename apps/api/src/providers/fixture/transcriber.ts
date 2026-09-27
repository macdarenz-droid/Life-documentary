// A transcriber for tests and local dev: it records each call (reading the stream, never keeping its
// bytes) and gives the answer a test set, or throws the failure it set.
import type { TranscribeInput, Transcriber, Transcription } from '../../pipeline/ports';

export type FixtureTranscriber = Transcriber & {
  /** Every call in order: the model, the content type and how many bytes the stream held. */
  calls: { model: string; contentType: string; bytes: number }[];
  /** What the next calls give: a transcription, or an error to throw. */
  answer: Transcription | Error;
  reset(): void;
};

const DEFAULT_ANSWER: Transcription = {
  text: 'We walked down to the lake after work.',
  language: 'en',
  seconds: 9,
};

async function length(body: ReadableStream<Uint8Array>): Promise<number> {
  let bytes = 0;
  for await (const chunk of body) bytes += chunk.byteLength;
  return bytes;
}

export function fixtureTranscriber(): FixtureTranscriber {
  const fixture: FixtureTranscriber = {
    calls: [],
    answer: DEFAULT_ANSWER,
    async transcribe({ model, body, contentType }: TranscribeInput) {
      fixture.calls.push({ model, contentType, bytes: await length(body) });
      if (fixture.answer instanceof Error) throw fixture.answer;
      return fixture.answer;
    },
    reset() {
      fixture.calls.length = 0;
      fixture.answer = DEFAULT_ANSWER;
    },
  };
  return fixture;
}
