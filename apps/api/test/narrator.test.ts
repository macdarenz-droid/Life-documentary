import { describe, expect, it } from 'vitest';
import {
  NARRATE_FORMAT,
  NARRATE_LANGUAGE,
  NARRATE_MODEL,
  VOICES_NOT_SET_UP,
  vendorVoice,
} from '../src/pipeline/narrate/settings';
import type { SpeakRequest } from '../src/pipeline/ports';
import { narrateMicroUsd } from '../src/policy/costs';
import { NARRATION_NOT_SET_UP, pipelineProviders } from '../src/providers';
import { elevenlabsNarrator, type Fetch } from '../src/providers/elevenlabs/narrator';
import { fixtures } from '../src/providers/fixture';
import { SILENT_MP3 } from '../src/providers/fixture/narrator';
import type { Env } from '../src/shared/env';
import { bindings } from './session';

const KEY = 'test-key-not-real';
const request: SpeakRequest = {
  voiceId: 'voice-abc',
  text: 'Home again.',
  modelId: NARRATE_MODEL,
  outputFormat: NARRATE_FORMAT,
  languageCode: NARRATE_LANGUAGE,
};

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
    );
  };
  return { fetcher, calls };
}

const alignment = {
  characters: ['H', 'i'],
  character_start_times_seconds: [0, 0.1],
  character_end_times_seconds: [0.1, 0.25],
};

describe('the ElevenLabs narrator', () => {
  it('sends the voice, format, key, text, model and language, and maps the answer', async () => {
    const { fetcher, calls } = stubFetch(
      200,
      {
        audio_base64: btoa('ABC'),
        alignment,
        normalized_alignment: { ...alignment, characters: ['h', 'i'] },
        something_new: { ignored: true },
      },
      { 'character-cost': '11', 'request-id': 'req-1' },
    );
    const speech = await elevenlabsNarrator(KEY, fetcher).speak(request);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-abc/with-timestamps?output_format=mp3_44100_128',
    );
    expect(call?.init.method).toBe('POST');
    expect(new Headers(call?.init.headers).get('xi-api-key')).toBe(KEY);
    expect(JSON.parse(call?.init.body as string)).toEqual({
      text: 'Home again.',
      model_id: 'eleven_flash_v2_5',
      language_code: 'en',
    });
    expect(new TextDecoder().decode(speech.audio)).toBe('ABC');
    expect(speech.alignment).toEqual({
      characters: ['H', 'i'],
      startSeconds: [0, 0.1],
      endSeconds: [0.1, 0.25],
    });
    expect(speech.characters).toBe(11);
  });

  it('gives no alignment when the answer has none, and counts the text without a cost header', async () => {
    const { fetcher } = stubFetch(200, { audio_base64: btoa('ABC'), alignment: null });
    const speech = await elevenlabsNarrator(KEY, fetcher).speak(request);
    expect(speech.alignment).toBeNull();
    expect(speech.characters).toBe('Home again.'.length);
  });

  it('throws on 429 with the status, never the text or the key', async () => {
    const { fetcher } = stubFetch(429, { detail: { status: 'too_many_concurrent_requests' } });
    const error = await elevenlabsNarrator(KEY, fetcher)
      .speak(request)
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('429');
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).not.toContain('Home again.');
  });

  it('fails without a key instead of speaking', async () => {
    const real: Env = { ...bindings };
    delete real.PROVIDERS;
    delete real.ELEVENLABS_API_KEY;
    await expect(pipelineProviders(real).narrator.speak(request)).rejects.toThrow(
      NARRATION_NOT_SET_UP,
    );
    expect(NARRATION_NOT_SET_UP).toBe('Narration is not set up');
  });

  it('is the fixture only when PROVIDERS is fixture', () => {
    expect(pipelineProviders(bindings).narrator).toBe(fixtures.narrator);
    const real: Env = { ...bindings, ELEVENLABS_API_KEY: KEY };
    delete real.PROVIDERS;
    expect(pipelineProviders(real).narrator).not.toBe(fixtures.narrator);
  });
});

describe('the fixture narrator', () => {
  it('records calls and answers a silent frame with an alignment at the set pace, or what a test sets', async () => {
    fixtures.reset();
    const { narrator } = fixtures;
    narrator.msPerCharacter = 100;
    const speech = await narrator.speak(request);
    expect(speech.audio).toBe(SILENT_MP3);
    expect(speech.alignment?.characters.join('')).toBe('Home again.');
    expect(speech.alignment?.endSeconds.at(-1)).toBeCloseTo(1.1);
    narrator.aligned = false;
    expect((await narrator.speak(request)).alignment).toBeNull();
    narrator.failures.push(new Error('ElevenLabs answered 500.'));
    await expect(narrator.speak(request)).rejects.toThrow('500');
    expect(narrator.calls).toHaveLength(3);
    fixtures.reset();
    expect(narrator.calls).toEqual([]);
    expect(narrator.aligned).toBe(true);
  });
});

describe('vendorVoice', () => {
  it('maps our id to the vendor voice', () => {
    expect(vendorVoice(bindings, 'narrator-1')).toBe('fixture-voice-1');
    expect(vendorVoice({ NARRATOR_VOICES: '{"narrator-2":"v2"}' }, 'narrator-2')).toBe('v2');
  });
  it('throws when the variable is missing, not JSON or lacks the id', () => {
    expect(() => vendorVoice({}, 'narrator-1')).toThrow(VOICES_NOT_SET_UP);
    expect(() => vendorVoice({ NARRATOR_VOICES: 'not json' }, 'narrator-1')).toThrow(
      VOICES_NOT_SET_UP,
    );
    expect(() => vendorVoice({ NARRATOR_VOICES: '{"narrator-2":"v2"}' }, 'narrator-1')).toThrow(
      VOICES_NOT_SET_UP,
    );
    expect(() => vendorVoice({ NARRATOR_VOICES: '{"narrator-1":""}' }, 'narrator-1')).toThrow(
      VOICES_NOT_SET_UP,
    );
    expect(VOICES_NOT_SET_UP).toBe('The narrator voices are not set up');
  });
});

describe('narrateMicroUsd', () => {
  it('prices 140 characters at 7,000 µUSD', () => {
    expect(narrateMicroUsd(140)).toBe(7000);
  });
});
