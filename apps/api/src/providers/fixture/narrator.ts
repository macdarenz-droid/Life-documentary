// A narrator for tests and local dev: it records each request and answers with one silent MP3 frame and
// an alignment spelling the text at a pace a test can set. A test can instead take the alignment away or
// make the next calls throw.
import type { Narrator, SpeakRequest, Speech } from '../../pipeline/ports';

/** One silent MPEG-1 Layer III frame: 128 kbit/s, 44.1 kHz, mono, 417 bytes (a Worker cannot read an .mp3). */
export const SILENT_MP3: Uint8Array = (() => {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0xc4]);
  return frame;
})();

export type FixtureNarrator = Narrator & {
  /** Every request, in order. */
  calls: SpeakRequest[];
  /** Milliseconds per character of the alignment. */
  msPerCharacter: number;
  /** When false, answers carry no alignment. */
  aligned: boolean;
  /** Errors the next calls throw, in order. */
  failures: Error[];
  reset(): void;
};

const DEFAULT_MS_PER_CHARACTER = 60;

export function fixtureNarrator(): FixtureNarrator {
  const fixture: FixtureNarrator = {
    calls: [],
    msPerCharacter: DEFAULT_MS_PER_CHARACTER,
    aligned: true,
    failures: [],
    speak(request) {
      return Promise.resolve().then((): Speech => {
        fixture.calls.push(request);
        const failure = fixture.failures.shift();
        if (failure) throw failure;
        const characters = [...request.text];
        const step = fixture.msPerCharacter / 1000;
        return {
          audio: SILENT_MP3,
          alignment: fixture.aligned
            ? {
                characters,
                startSeconds: characters.map((_, i) => i * step),
                endSeconds: characters.map((_, i) => (i + 1) * step),
              }
            : null,
          characters: request.text.length,
        };
      });
    },
    reset() {
      fixture.calls.length = 0;
      fixture.msPerCharacter = DEFAULT_MS_PER_CHARACTER;
      fixture.aligned = true;
      fixture.failures.length = 0;
    },
  };
  return fixture;
}
