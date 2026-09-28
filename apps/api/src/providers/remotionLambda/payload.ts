// The `start` and `status` payloads of a Remotion Lambda function, built the way Remotion 4.0.529 builds
// them (`makeLambdaRenderMediaPayload`, `getRenderProgressPayload`; the Python client's `models.py`). The
// payload must match the deployed function's version exactly, so the Node tests compare these with
// Remotion's own builders. Options come from the pipeline's render settings; nothing here decides them.
import type { RenderManifestV2 } from '@life/contracts';
import type { RenderOptions } from '../../pipeline/ports';

export const REMOTION_VERSION = '4.0.529';

export const INPUT_TOO_LARGE = 'The render input is too large';

/** Where Lambda writes the MP4 and reads progress: R2's S3 endpoint with its token. */
export type S3OutputProvider = { endpoint: string; accessKeyId: string; secretAccessKey: string };

export type StartPayloadInput = {
  serveUrl: string;
  composition: string;
  manifest: RenderManifestV2;
  options: RenderOptions;
  /** The media bucket and key the MP4 goes to. */
  outName: { bucketName: string; key: string; s3OutputProvider: S3OutputProvider };
  maxInputBytes: number;
};

/** Remotion's inline input props: the manifest as JSON text, refused above `maxInputBytes`. */
function inlineProps(manifest: RenderManifestV2, maxInputBytes: number) {
  const payload = JSON.stringify(manifest);
  if (new TextEncoder().encode(payload).byteLength > maxInputBytes) {
    throw new Error(INPUT_TOO_LARGE);
  }
  return { type: 'payload' as const, payload };
}

/** The `start` payload for one render. Fields we do not set carry Remotion's defaults. */
export function startPayload(input: StartPayloadInput) {
  const { options } = input;
  return {
    enableCancellation: false,
    rendererFunctionName: null,
    framesPerLambda: null,
    concurrency: null,
    composition: input.composition,
    serveUrl: input.serveUrl,
    inputProps: inlineProps(input.manifest, input.maxInputBytes),
    codec: options.codec,
    imageFormat: options.imageFormat,
    crf: null,
    envVariables: {},
    pixelFormat: null,
    proResProfile: null,
    x264Preset: null,
    gopSize: null,
    jpegQuality: 80,
    maxRetries: options.maxRetries,
    privacy: options.privacy,
    logLevel: options.logLevel,
    frameRange: null,
    outName: input.outName,
    timeoutInMilliseconds: options.timeoutInMilliseconds,
    chromiumOptions: {},
    scale: 1,
    everyNthFrame: 1,
    numberOfGifLoops: null,
    concurrencyPerLambda: 1,
    downloadBehavior: { type: 'play-in-browser' as const },
    muted: false,
    version: REMOTION_VERSION,
    overwrite: false,
    audioBitrate: null,
    videoBitrate: null,
    encodingBufferSize: null,
    encodingMaxRate: null,
    webhook: null,
    forceHeight: null,
    forceWidth: null,
    forceFps: null,
    forceDurationInFrames: null,
    bucketName: null,
    audioCodec: null,
    type: 'start' as const,
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: options.deleteAfter,
    colorSpace: null,
    preferLossless: false,
    forcePathStyle: false,
    metadata: null,
    licenseKey: null,
    offthreadVideoThreads: null,
    mediaCacheSizeInBytes: null,
    storageClass: null,
    isProduction: null,
    sampleRate: 48_000,
  };
}

/** The `status` payload for a started render, with the same output provider as its start. */
export function statusPayload(input: {
  renderId: string;
  bucketName: string;
  logLevel: RenderOptions['logLevel'];
  s3OutputProvider: S3OutputProvider;
}) {
  return {
    type: 'status' as const,
    bucketName: input.bucketName,
    renderId: input.renderId,
    version: REMOTION_VERSION,
    s3OutputProvider: input.s3OutputProvider,
    logLevel: input.logLevel,
    forcePathStyle: false,
  };
}
