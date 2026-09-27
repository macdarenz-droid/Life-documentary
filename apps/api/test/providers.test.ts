import type { MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import { describe, expect, it } from 'vitest';
import type { CaptionResult } from '../src/pipeline/ports';
import { anthropicCaptioner, type BatchApi } from '../src/providers/anthropic/captioner';
import { fixtures } from '../src/providers/fixture';
import { CAPTIONING_NOT_SET_UP, pipelineProviders } from '../src/providers';
import { workersAiTranscriber, type WhisperBinding } from '../src/providers/workersAi/transcriber';
import type { Env } from '../src/shared/env';
import { bindings } from './session';

const stream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

describe('the Workers AI transcriber', () => {
  it('streams the file with its content type and voice detection on, and maps what came back', async () => {
    const calls: { model: string; inputs: Parameters<WhisperBinding['run']>[1] }[] = [];
    const ai: WhisperBinding = {
      run: (model, inputs) => {
        calls.push({ model, inputs });
        return Promise.resolve({
          text: '  We walked to the lake.  ',
          transcription_info: { language: 'de', duration: 9.4 },
        });
      },
    };
    const body = stream();
    const out = await workersAiTranscriber(ai).transcribe({
      model: '@cf/openai/whisper-large-v3-turbo',
      body,
      contentType: 'audio/mp4',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(calls[0]!.inputs.audio.body).toBe(body);
    expect(calls[0]!.inputs.audio.contentType).toBe('audio/mp4');
    expect(calls[0]!.inputs.vad_filter).toBe(true);
    expect(out).toEqual({ text: 'We walked to the lake.', language: 'de', seconds: 9.4 });
  });

  it('maps two segments, one with words, from seconds to whole ms', async () => {
    const ai: WhisperBinding = {
      run: () =>
        Promise.resolve({
          text: 'We walked. To the lake.',
          segments: [
            {
              text: ' We walked.',
              start: 0,
              end: 1.2345,
              words: [
                { word: ' We', start: 0, end: 0.4 },
                { word: ' walked.', start: 0.4, end: 1.2345 },
              ],
            },
            { text: ' To the lake. ', start: 1.5, end: 2.75 },
          ],
        }),
    };
    const out = await workersAiTranscriber(ai).transcribe({
      model: 'm',
      body: stream(),
      contentType: 'audio/mp4',
    });
    expect(out.segments).toEqual([
      {
        text: 'We walked.',
        startMs: 0,
        endMs: 1235,
        words: [
          { text: 'We', startMs: 0, endMs: 400 },
          { text: 'walked.', startMs: 400, endMs: 1235 },
        ],
      },
      { text: 'To the lake.', startMs: 1500, endMs: 2750 },
    ]);
  });

  it('gives no segments when the model gives none', async () => {
    const ai: WhisperBinding = { run: () => Promise.resolve({ text: 'Hi.' }) };
    const out = await workersAiTranscriber(ai).transcribe({
      model: 'm',
      body: stream(),
      contentType: 'audio/mp4',
    });
    expect(out.segments).toBeUndefined();
  });

  it('drops an empty segment and an empty word', async () => {
    const ai: WhisperBinding = {
      run: () =>
        Promise.resolve({
          text: 'Hi there.',
          segments: [
            { text: '   ', start: 0, end: 0.5 },
            {
              text: 'Hi there.',
              start: 0.5,
              end: 1.5,
              words: [
                { word: ' ', start: 0.5, end: 0.6 },
                { word: 'Hi', start: 0.6, end: 1 },
                { word: 'there.', start: 1, end: 1.5 },
              ],
            },
          ],
        }),
    };
    const out = await workersAiTranscriber(ai).transcribe({
      model: 'm',
      body: stream(),
      contentType: 'audio/mp4',
    });
    expect(out.segments).toEqual([
      {
        text: 'Hi there.',
        startMs: 500,
        endMs: 1500,
        words: [
          { text: 'Hi', startMs: 600, endMs: 1000 },
          { text: 'there.', startMs: 1000, endMs: 1500 },
        ],
      },
    ]);
  });

  it('leaves out a language and a duration the model did not give', async () => {
    const ai: WhisperBinding = { run: () => Promise.resolve({ text: '' }) };
    const out = await workersAiTranscriber(ai).transcribe({
      model: 'm',
      body: stream(),
      contentType: 'video/quicktime',
    });
    expect(out).toEqual({ text: '' });
  });
});

describe('the Anthropic captioner', () => {
  const succeeded = (
    id: string,
    text: string,
    stop: 'end_turn' | 'refusal',
    input: number,
    output: number,
  ) =>
    ({
      custom_id: id,
      result: {
        type: 'succeeded',
        message: {
          content: [{ type: 'text', text }],
          stop_reason: stop,
          usage: { input_tokens: input, output_tokens: output },
        },
      },
    }) as unknown as MessageBatchIndividualResponse;

  function stub(entries: MessageBatchIndividualResponse[]) {
    const calls: string[] = [];
    const created: Parameters<BatchApi['create']>[0][] = [];
    const api: BatchApi = {
      create: (params) => {
        created.push(params);
        calls.push('create');
        return Promise.resolve({ id: 'msgbatch_1' });
      },
      retrieve: (id) => {
        calls.push(`retrieve:${id}`);
        return Promise.resolve({ processing_status: 'canceling' as const });
      },
      results: (id) => {
        calls.push(`results:${id}`);
        return Promise.resolve({
          [Symbol.asyncIterator]: async function* () {
            yield* await Promise.resolve(entries);
          },
        });
      },
      cancel: (id) => {
        calls.push(`cancel:${id}`);
        return Promise.resolve();
      },
      delete: (id) => {
        calls.push(`delete:${id}`);
        return Promise.resolve();
      },
    };
    return { api, calls, created };
  }

  it('sends one request per image with the model, limit, system and user text it is given', async () => {
    const { api, created } = stub([]);
    const id = await anthropicCaptioner(api).submit(
      [
        { id: 'moment-a', jpegBase64: 'QUJD' },
        { id: 'moment-b', jpegBase64: 'REVG' },
      ],
      {
        model: 'model-x',
        system: 'System words.',
        userText: 'Describe this photo.',
        maxTokens: 200,
      },
    );
    expect(id).toBe('msgbatch_1');
    expect(created).toHaveLength(1);
    expect(created[0]!.requests).toEqual(
      ['moment-a', 'moment-b'].map((customId, i) => ({
        custom_id: customId,
        params: {
          model: 'model-x',
          max_tokens: 200,
          system: 'System words.',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: ['QUJD', 'REVG'][i],
                  },
                },
                { type: 'text', text: 'Describe this photo.' },
              ],
            },
          ],
        },
      })),
    );
  });

  it('treats a 404 on delete as already deleted and passes other failures on', async () => {
    let failure: Error = Object.assign(new Error('Not found'), { status: 404 });
    const api = {
      delete: () => Promise.reject(failure),
    } as unknown as BatchApi;
    await expect(anthropicCaptioner(api).remove('msgbatch_1')).resolves.toBeUndefined();
    failure = Object.assign(new Error('Overloaded'), { status: 529 });
    await expect(anthropicCaptioner(api).remove('msgbatch_1')).rejects.toThrow('Overloaded');
  });

  it('maps results in any order with their token counts and keeps what came back', async () => {
    const { api, calls } = stub([
      succeeded('c', 'I cannot help with that.', 'refusal', 900, 8),
      { custom_id: 'b', result: { type: 'expired' } },
      succeeded('a', 'A tram in the rain.', 'end_turn', 972, 7),
      {
        custom_id: 'd',
        result: { type: 'errored', error: {} },
      } as unknown as MessageBatchIndividualResponse,
      { custom_id: 'e', result: { type: 'canceled' } },
    ]);
    const captioner = anthropicCaptioner(api);
    const results: CaptionResult[] = await all(captioner.results('msgbatch_1'));
    expect(results).toEqual([
      {
        id: 'c',
        outcome: 'succeeded',
        text: 'I cannot help with that.',
        stopReason: 'refusal',
        inputTokens: 900,
        outputTokens: 8,
      },
      { id: 'b', outcome: 'expired', inputTokens: 0, outputTokens: 0 },
      {
        id: 'a',
        outcome: 'succeeded',
        text: 'A tram in the rain.',
        stopReason: 'end_turn',
        inputTokens: 972,
        outputTokens: 7,
      },
      { id: 'd', outcome: 'errored', inputTokens: 0, outputTokens: 0 },
      { id: 'e', outcome: 'canceled', inputTokens: 0, outputTokens: 0 },
    ]);
    expect(await captioner.status('msgbatch_1')).toBe('canceling');
    await captioner.cancel('msgbatch_1');
    await captioner.remove('msgbatch_1');
    expect(calls).toEqual([
      'results:msgbatch_1',
      'retrieve:msgbatch_1',
      'cancel:msgbatch_1',
      'delete:msgbatch_1',
    ]);
  });
});

describe('pipelineProviders', () => {
  it('gives the fixtures when PROVIDERS is fixture', () => {
    expect(bindings.PROVIDERS).toBe('fixture');
    expect(pipelineProviders(bindings)).toBe(fixtures);
  });

  it('gives the real adapters otherwise, and a captioner without a key fails instead of answering', async () => {
    const real: Env = { ...bindings };
    delete real.PROVIDERS;
    delete real.ANTHROPIC_API_KEY;
    const providers = pipelineProviders(real);
    expect(providers).not.toBe(fixtures);
    expect(providers.transcriber).not.toBe(fixtures.transcriber);
    const { captioner } = providers;
    await expect(
      captioner.submit([{ id: 'a', jpegBase64: 'QUJD' }], {
        model: 'm',
        system: 's',
        userText: 'u',
        maxTokens: 10,
      }),
    ).rejects.toThrow(CAPTIONING_NOT_SET_UP);
    await expect(all(captioner.results('x'))).rejects.toThrow(CAPTIONING_NOT_SET_UP);
    await expect(captioner.status('x')).rejects.toThrow(CAPTIONING_NOT_SET_UP);
    expect(CAPTIONING_NOT_SET_UP).toBe('Captioning is not set up');
  });

  it('builds the Anthropic captioner when the key is there, without calling it', () => {
    const real: Env = { ...bindings, ANTHROPIC_API_KEY: 'test-key-not-real' };
    delete real.PROVIDERS;
    const providers = pipelineProviders(real);
    expect(providers.captioner).not.toBe(fixtures.captioner);
  });
});

describe('the fixture providers', () => {
  it('record calls, give set answers and failures, and can keep a batch in progress', async () => {
    fixtures.reset();
    const { transcriber, captioner } = fixtures;
    const heard = await transcriber.transcribe({
      model: 'm',
      body: stream(),
      contentType: 'audio/mp4',
    });
    expect(heard.text.length).toBeGreaterThan(0);
    expect(transcriber.calls).toEqual([{ model: 'm', contentType: 'audio/mp4', bytes: 3 }]);
    transcriber.answer = { text: '' };
    expect(
      await transcriber.transcribe({ model: 'm', body: stream(), contentType: 'audio/mp4' }),
    ).toEqual({ text: '' });
    transcriber.answer = new Error('Workers AI is down');
    await expect(
      transcriber.transcribe({ model: 'm', body: stream(), contentType: 'audio/mp4' }),
    ).rejects.toThrow('Workers AI is down');

    const request = { model: 'm', system: 's', userText: 'u', maxTokens: 200 };
    captioner.answer = () => ({
      outcome: 'succeeded',
      text: 'unclear',
      stopReason: 'refusal',
      inputTokens: 1,
      outputTokens: 1,
    });
    captioner.stayInProgress = true;
    const batch = await captioner.submit([{ id: 'a', jpegBase64: 'QUJD' }], request);
    expect(await captioner.status(batch)).toBe('in_progress');
    await expect(captioner.remove(batch)).rejects.toThrow();
    await captioner.cancel(batch);
    expect(await all(captioner.results(batch))).toEqual([
      { id: 'a', outcome: 'canceled', inputTokens: 0, outputTokens: 0 },
    ]);
    captioner.stayInProgress = false;
    const done = await captioner.submit([{ id: 'b', jpegBase64: 'REVG' }], request);
    expect(await all(captioner.results(done))).toEqual([
      {
        id: 'b',
        outcome: 'succeeded',
        text: 'unclear',
        stopReason: 'refusal',
        inputTokens: 1,
        outputTokens: 1,
      },
    ]);
    captioner.failSubmit = new Error('No connection');
    await expect(captioner.submit([], request)).rejects.toThrow('No connection');
    fixtures.reset();
  });
});
