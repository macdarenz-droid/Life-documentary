import { fixtureManifest } from '@life/story';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderStart } from '../src/pipeline/ports';
import { RENDER_COMPOSITION, RENDER_OPTIONS } from '../src/pipeline/render/settings';
import { RENDERING_NOT_SET_UP } from '../src/providers/r2/presign';
import { INPUT_TOO_LARGE, REMOTION_VERSION } from '../src/providers/remotionLambda/payload';
import {
  RENDER_CALL_FAILED,
  remotionLambdaRenderer,
} from '../src/providers/remotionLambda/renderer';

afterEach(() => vi.restoreAllMocks());

const SECRETS = {
  REMOTION_AWS_ACCESS_KEY_ID: 'AKIATESTINVOKEONLY',
  REMOTION_AWS_SECRET_ACCESS_KEY: 'lambda-secret-do-not-leak',
  REMOTION_REGION: 'eu-central-1',
  REMOTION_FUNCTION_NAME: 'remotion-render-4-0-529-mem2048mb-disk2048mb-240sec',
  REMOTION_SERVE_URL:
    'https://remotionlambda-eucentral1-abcdef.s3.eu-central-1.amazonaws.com/sites/life-episode/index.html',
  R2_ACCOUNT_ID: 'r2account0123',
  R2_ACCESS_KEY_ID: 'r2-key-id',
  R2_SECRET_ACCESS_KEY: 'r2-secret-do-not-leak',
  R2_BUCKET: 'life-media',
};
const OUT_KEY = `u/${crypto.randomUUID()}/${crypto.randomUUID()}/episodes/${crypto.randomUUID()}/v1.mp4`;
const INVOKE_URL = `https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/${SECRETS.REMOTION_FUNCTION_NAME}/invocations`;
const R2_OUTPUT = {
  endpoint: 'https://r2account0123.r2.cloudflarestorage.com',
  accessKeyId: 'r2-key-id',
  secretAccessKey: 'r2-secret-do-not-leak',
};

const start = (manifest = fixtureManifest()): RenderStart => ({
  manifest,
  composition: RENDER_COMPOSITION,
  outKey: OUT_KEY,
  options: RENDER_OPTIONS,
});

/** Stubs `fetch` with one answer per call, in order, and records each request. */
function stubFetch(...answers: Response[]) {
  const requests: Request[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    requests.push(new Request(input, init));
    const answer = answers.shift();
    return Promise.resolve(answer ?? new Response('{}', { status: 500 }));
  });
  return { spy, requests };
}

const json = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** No secret, URL, manifest text or vendor text in a thrown message. */
function expectClean(message: string) {
  for (const secret of Object.values(SECRETS)) expect(message).not.toContain(secret);
  expect(message).not.toMatch(/https?:/);
  expect(message).not.toContain('segments');
  expect(message).not.toContain('vendor-detail');
}

describe('the Remotion Lambda renderer', () => {
  it('invokes the function synchronously with a SigV4 request and a start payload', async () => {
    const { requests } = stubFetch(
      json('{"type":"success","renderId":"r-1","bucketName":"remotionlambda-eucentral1-abcdef"}'),
    );
    const started = await remotionLambdaRenderer(SECRETS).start(start());
    expect(started).toEqual({ renderId: 'r-1', bucketName: 'remotionlambda-eucentral1-abcdef' });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe(INVOKE_URL);
    expect(request.method).toBe('POST');
    expect(request.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTINVOKEONLY\/\d{8}\/eu-central-1\/lambda\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/,
    );
    expect(request.headers.get('x-amz-invocation-type')).toBe('RequestResponse');
    const body = await request.json();
    expect(body).toMatchObject({
      type: 'start',
      composition: 'Episode',
      version: REMOTION_VERSION,
      serveUrl: SECRETS.REMOTION_SERVE_URL,
      privacy: 'no-acl',
      deleteAfter: '1-day',
      outName: { bucketName: 'life-media', key: OUT_KEY, s3OutputProvider: R2_OUTPUT },
      inputProps: { type: 'payload', payload: JSON.stringify(fixtureManifest()) },
    });
  });

  it('sends the same output provider in the status payload', async () => {
    const { requests } = stubFetch(json('{"type":"success","done":false,"overallProgress":0.25}'));
    const progress = await remotionLambdaRenderer(SECRETS).progress({
      renderId: 'r-1',
      bucketName: 'remotionlambda-eucentral1-abcdef',
    });
    expect(progress).toEqual({ state: 'rendering', fraction: 0.25 });
    expect(await requests[0]!.json()).toEqual({
      type: 'status',
      renderId: 'r-1',
      bucketName: 'remotionlambda-eucentral1-abcdef',
      version: REMOTION_VERSION,
      s3OutputProvider: R2_OUTPUT,
      logLevel: 'warn',
      forcePathStyle: false,
    });
  });

  it('takes the last object of a concatenated JSON answer', async () => {
    stubFetch(
      json(
        '{"type":"success","renderId":"early","bucketName":"b0"}{"note":"{braces}"}\n{"type":"success","renderId":"r-9","bucketName":"b-9"}',
      ),
    );
    expect(await remotionLambdaRenderer(SECRETS).start(start())).toEqual({
      renderId: 'r-9',
      bucketName: 'b-9',
    });
  });

  it.each([
    [
      'an errorMessage answer',
      json(`{"errorMessage":"vendor-detail at ${SECRETS.REMOTION_SERVE_URL}","errorType":"Error"}`),
    ],
    ['a type error answer', json('{"type":"error","message":"vendor-detail https://x.example"}')],
    [
      'a function-error header',
      json('{"type":"success","renderId":"r","bucketName":"b"}', {
        headers: { 'x-amz-function-error': 'Unhandled' },
      }),
    ],
    ['a 429', json('{"message":"vendor-detail Rate exceeded"}', { status: 429 })],
  ])('throws once on %s, with a fixed message', async (_, answer) => {
    const { spy } = stubFetch(answer);
    const error = await remotionLambdaRenderer(SECRETS)
      .start(start())
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(error?.message).toBe(RENDER_CALL_FAILED);
    expectClean(error!.message);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('maps progress: done with its cost and size, and a fatal error to a fixed reason', async () => {
    stubFetch(
      json(
        '{"type":"success","done":true,"overallProgress":1,"costs":{"accruedSoFar":0.0421,"currency":"USD"},"outputSizeInBytes":4200000,"somethingNew":{"x":1}}',
      ),
      json(
        `{"type":"success","done":false,"fatalErrorEncountered":true,"errors":[{"message":"vendor-detail could not read ${SECRETS.REMOTION_SERVE_URL}","isFatal":true}]}`,
      ),
      json(
        '{"type":"success","done":false,"fatalErrorEncountered":true,"errors":[{"name":"TimeoutError","message":"Timed out after 240s","isFatal":true}]}',
      ),
    );
    const renderer = remotionLambdaRenderer(SECRETS);
    const at = { renderId: 'r-1', bucketName: 'b' };
    expect(await renderer.progress(at)).toEqual({
      state: 'done',
      costUsd: 0.0421,
      bytes: 4_200_000,
    });
    const failed = await renderer.progress(at);
    expect(failed).toEqual({ state: 'failed', reason: 'render failed' });
    expect(JSON.stringify(failed)).not.toContain('http');
    expect(await renderer.progress(at)).toEqual({ state: 'failed', reason: 'render timed out' });
  });

  it('refuses a manifest over 200 KB before any call', async () => {
    const { spy } = stubFetch();
    const big = fixtureManifest();
    big.segments = big.segments.map((s) =>
      s.kind === 'shot' || s.kind === 'coldOpen'
        ? { ...s, media: { ...s.media, src: `https://example.com/${'a'.repeat(50_000)}` } }
        : s,
    );
    await expect(remotionLambdaRenderer(SECRETS).start(start(big))).rejects.toThrow(
      INPUT_TOO_LARGE,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('says rendering is not set up without its secrets, and makes no call', async () => {
    const { spy } = stubFetch();
    const missing: Partial<typeof SECRETS> = { ...SECRETS };
    delete missing.REMOTION_FUNCTION_NAME;
    await expect(
      remotionLambdaRenderer({ ...missing, R2_BUCKET: SECRETS.R2_BUCKET }).start(start()),
    ).rejects.toThrow(RENDERING_NOT_SET_UP);
    await expect(
      remotionLambdaRenderer({ ...SECRETS, R2_SECRET_ACCESS_KEY: '' }).progress({
        renderId: 'r',
        bucketName: 'b',
      }),
    ).rejects.toThrow(RENDERING_NOT_SET_UP);
    expect(spy).not.toHaveBeenCalled();
  });
});
