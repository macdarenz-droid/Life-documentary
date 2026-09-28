// The Renderer on the owner's Remotion Lambda (P15, D41). Remotion's own Lambda client does not run on
// Workers, so this signs a synchronous `Invoke` with aws4fetch and sends the payloads Remotion's clients
// send. It never retries (a start is never sent twice) and never passes a vendor's text on: every failure
// is a fixed short message, with no key, URL or manifest in it.
import { AwsClient } from 'aws4fetch';
import type { RenderFailure, RenderProgress, Renderer } from '../../pipeline/ports';
import { MAX_INPUT_BYTES, RENDER_OPTIONS } from '../../pipeline/render/settings';
import type { Env } from '../../shared/env';
import { RENDERING_NOT_SET_UP } from '../r2/presign';
import { startPayload, statusPayload, type S3OutputProvider } from './payload';

export const RENDER_CALL_FAILED = 'The render service did not answer as expected';

type LambdaEnv = Pick<
  Env,
  | 'REMOTION_AWS_ACCESS_KEY_ID'
  | 'REMOTION_AWS_SECRET_ACCESS_KEY'
  | 'REMOTION_REGION'
  | 'REMOTION_FUNCTION_NAME'
  | 'REMOTION_SERVE_URL'
  | 'R2_ACCOUNT_ID'
  | 'R2_ACCESS_KEY_ID'
  | 'R2_SECRET_ACCESS_KEY'
  | 'R2_BUCKET'
>;

type Setup = {
  client: AwsClient;
  invokeUrl: string;
  serveUrl: string;
  bucket: string;
  output: S3OutputProvider;
};

function setup(env: LambdaEnv): Setup {
  const {
    REMOTION_AWS_ACCESS_KEY_ID: accessKeyId,
    REMOTION_AWS_SECRET_ACCESS_KEY: secretAccessKey,
    REMOTION_REGION: region,
    REMOTION_FUNCTION_NAME: functionName,
    REMOTION_SERVE_URL: serveUrl,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
  } = env;
  if (
    !accessKeyId ||
    !secretAccessKey ||
    !region ||
    !functionName ||
    !serveUrl ||
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    throw new Error(RENDERING_NOT_SET_UP);
  }
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 'lambda', region, retries: 0 }),
    invokeUrl: `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
    serveUrl,
    bucket: R2_BUCKET,
    output: {
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  };
}

/** The complete top-level JSON objects in `text`, as Remotion's Python client finds them. */
export function jsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) objects.push(text.slice(start, i + 1));
    }
  }
  return objects;
}

type Answer = Record<string, unknown>;

/** One synchronous invoke; the last JSON object of the answer, which must say `success`. */
async function invoke(setup: Setup, payload: unknown): Promise<Answer> {
  const response = await setup.client.fetch(setup.invokeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-amz-invocation-type': 'RequestResponse' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok || response.headers.has('x-amz-function-error')) {
    throw new Error(RENDER_CALL_FAILED);
  }
  let answer: unknown;
  try {
    const last = jsonObjects(text).at(-1);
    answer = last === undefined ? undefined : JSON.parse(last);
  } catch {
    throw new Error(RENDER_CALL_FAILED);
  }
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new Error(RENDER_CALL_FAILED);
  }
  const found = answer as Answer;
  if ('errorMessage' in found || found.type !== 'success') throw new Error(RENDER_CALL_FAILED);
  return found;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;
const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** A fatal error is a timeout when Remotion says so; any other fatal error is a failed render. */
function failure(answer: Answer): RenderFailure {
  const errors = Array.isArray(answer.errors) ? (answer.errors as unknown[]) : [];
  const timedOut = errors.some((e) => {
    if (e === null || typeof e !== 'object') return false;
    const { message, name } = e as { message?: unknown; name?: unknown };
    return /timed? ?out/i.test(`${text(name) ?? ''} ${text(message) ?? ''}`);
  });
  return timedOut ? 'render timed out' : 'render failed';
}

/** What a progress answer says, mapped to the port; unknown fields are ignored. */
export function progressOf(answer: Answer): RenderProgress {
  const errors = Array.isArray(answer.errors) ? answer.errors : [];
  const fatal =
    answer.fatalErrorEncountered === true ||
    errors.some(
      (e) => e !== null && typeof e === 'object' && (e as { isFatal?: unknown }).isFatal === true,
    );
  if (fatal) return { state: 'failed', reason: failure(answer) };
  if (answer.done === true) {
    const costs = answer.costs as { accruedSoFar?: unknown } | undefined;
    const costUsd = count(costs?.accruedSoFar);
    const bytes = count(answer.outputSizeInBytes);
    return {
      state: 'done',
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...(bytes !== undefined ? { bytes } : {}),
    };
  }
  const fraction = count(answer.overallProgress) ?? 0;
  return { state: 'rendering', fraction: Math.min(1, fraction) };
}

export function remotionLambdaRenderer(env: LambdaEnv): Renderer {
  return {
    async start({ manifest, composition, outKey, options }) {
      const lambda = setup(env);
      const payload = startPayload({
        serveUrl: lambda.serveUrl,
        composition,
        manifest,
        options,
        outName: { bucketName: lambda.bucket, key: outKey, s3OutputProvider: lambda.output },
        maxInputBytes: MAX_INPUT_BYTES,
      });
      const answer = await invoke(lambda, payload);
      const renderId = text(answer.renderId);
      const bucketName = text(answer.bucketName);
      if (!renderId || !bucketName) throw new Error(RENDER_CALL_FAILED);
      return { renderId, bucketName };
    },
    async progress({ renderId, bucketName }) {
      const lambda = setup(env);
      const answer = await invoke(
        lambda,
        statusPayload({
          renderId,
          bucketName,
          logLevel: RENDER_OPTIONS.logLevel,
          s3OutputProvider: lambda.output,
        }),
      );
      return progressOf(answer);
    },
  };
}
