// Our Lambda payloads against Remotion's own builders (@remotion/lambda-client 4.0.529). The deployed
// function refuses a payload of another version, so these must match field by field.
import { createRequire } from 'node:module';
import { LambdaClientInternals } from '@remotion/lambda-client';
import { fixtureManifest } from '@life/story';
import { describe, expect, it } from 'vitest';
import { RENDER_COMPOSITION, RENDER_OPTIONS } from '../src/pipeline/render/settings';
import {
  REMOTION_VERSION,
  startPayload,
  statusPayload,
} from '../src/providers/remotionLambda/payload';

const SERVE_URL =
  'https://remotionlambda-eucentral1-abcdef.s3.eu-central-1.amazonaws.com/sites/life-episode/index.html';
const OUTPUT = {
  endpoint: 'https://r2account0123.r2.cloudflarestorage.com',
  accessKeyId: 'r2-key-id',
  secretAccessKey: 'r2-secret',
};
const OUT_NAME = {
  bucketName: 'life-media',
  key: 'u/user/documentary/episodes/episode/v1.mp4',
  s3OutputProvider: OUTPUT,
};
const manifest = fixtureManifest();

async function remotionStart() {
  const options = LambdaClientInternals.renderMediaOnLambdaOptionalToRequired({
    region: 'eu-central-1',
    functionName: 'remotion-render-4-0-529-mem2048mb-disk2048mb-240sec',
    serveUrl: SERVE_URL,
    composition: RENDER_COMPOSITION,
    inputProps: manifest,
    codec: RENDER_OPTIONS.codec,
    imageFormat: RENDER_OPTIONS.imageFormat,
    privacy: RENDER_OPTIONS.privacy,
    maxRetries: RENDER_OPTIONS.maxRetries,
    timeoutInMilliseconds: RENDER_OPTIONS.timeoutInMilliseconds,
    logLevel: RENDER_OPTIONS.logLevel,
    deleteAfter: RENDER_OPTIONS.deleteAfter,
    outName: OUT_NAME,
  });
  return LambdaClientInternals.makeLambdaRenderMediaPayload(options);
}

const ours = () =>
  startPayload({
    serveUrl: SERVE_URL,
    composition: RENDER_COMPOSITION,
    manifest,
    options: RENDER_OPTIONS,
    outName: OUT_NAME,
    maxInputBytes: 200_000,
  });

describe('the start payload', () => {
  it('equals Remotion’s own for the same options, field by field', async () => {
    const theirs = (await remotionStart()) as unknown as Record<string, unknown>;
    const mine = ours() as unknown as Record<string, unknown>;
    expect(Object.keys(mine).sort()).toEqual(Object.keys(theirs).sort());
    for (const key of Object.keys(theirs)) expect([key, mine[key]]).toEqual([key, theirs[key]]);
  });

  it('carries the manifest inline, as Remotion serialises it', async () => {
    const theirs = await remotionStart();
    expect(ours().inputProps).toEqual(theirs.inputProps);
    expect(JSON.parse(ours().inputProps.payload)).toEqual(manifest);
  });
});

describe('the status payload', () => {
  it('equals Remotion’s getRenderProgressPayload for the same render', () => {
    const theirs = LambdaClientInternals.getRenderProgressPayload({
      region: 'eu-central-1',
      functionName: 'remotion-render-4-0-529-mem2048mb-disk2048mb-240sec',
      bucketName: 'remotionlambda-eucentral1-abcdef',
      renderId: 'r-1',
      s3OutputProvider: OUTPUT,
      logLevel: RENDER_OPTIONS.logLevel,
    });
    expect(
      statusPayload({
        renderId: 'r-1',
        bucketName: 'remotionlambda-eucentral1-abcdef',
        logLevel: RENDER_OPTIONS.logLevel,
        s3OutputProvider: OUTPUT,
      }),
    ).toEqual(theirs);
  });
});

describe('the version', () => {
  it('matches Remotion’s payload and the installed client', async () => {
    const pkg = createRequire(import.meta.url)('@remotion/lambda-client/package.json') as {
      version: string;
    };
    expect(REMOTION_VERSION).toBe((await remotionStart()).version);
    expect(REMOTION_VERSION).toBe(pkg.version);
  });
});
