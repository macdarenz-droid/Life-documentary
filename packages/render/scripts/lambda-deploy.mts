// Deploys the episode site and the render function to the owner's Remotion Lambda (P15, D41), in
// REMOTION_REGION, with AWS credentials from the environment only (REMOTION_AWS_ACCESS_KEY_ID and
// REMOTION_AWS_SECRET_ACCESS_KEY, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY). It prints the function
// name and serve URL to set as Worker secrets. See docs/ops/RENDER.md.
import {
  deployFunction,
  deploySiteFromBundle,
  getOrCreateBucket,
  getRegions,
  type AwsRegion,
} from '@remotion/lambda';
import process from 'node:process';
import { bundleProject, fail } from './shared.mjs';

const SITE_NAME = 'life-episode';
const MEMORY_MB = 2048;
const DISK_MB = 2048;
const TIMEOUT_S = 240;
const LOG_DAYS = 7;

const region = process.env.REMOTION_REGION;
if (!region || !getRegions().includes(region as AwsRegion)) {
  fail(`Set REMOTION_REGION to one of: ${getRegions().join(', ')}`);
}
const hasKeys =
  (process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_SECRET_ACCESS_KEY) ||
  (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
if (!hasKeys) fail('Set the deploy user’s AWS keys in the environment first.');
const awsRegion = region as AwsRegion;

const { bucketName } = await getOrCreateBucket({ region: awsRegion, enableFolderExpiry: true });
process.stdout.write(`bucket ${bucketName}\n`);

// deploySite() is deprecated in 4.0.529 in favour of bundling first, then deploySiteFromBundle().
const bundleDir = await bundleProject();
const { serveUrl } = await deploySiteFromBundle({
  bundleDir,
  bucketName,
  region: awsRegion,
  siteName: SITE_NAME,
});

const { functionName, alreadyExisted } = await deployFunction({
  region: awsRegion,
  memorySizeInMb: MEMORY_MB,
  diskSizeInMb: DISK_MB,
  timeoutInSeconds: TIMEOUT_S,
  createCloudWatchLogGroup: true,
  cloudWatchLogRetentionPeriodInDays: LOG_DAYS,
});

process.stdout.write(
  [
    `function ${functionName}${alreadyExisted ? ' (already there)' : ''}`,
    `site ${serveUrl}`,
    '',
    'Set these as Worker secrets (from apps/api):',
    `  wrangler secret put REMOTION_REGION        → ${awsRegion}`,
    `  wrangler secret put REMOTION_FUNCTION_NAME → ${functionName}`,
    `  wrangler secret put REMOTION_SERVE_URL     → ${serveUrl}`,
    '',
  ].join('\n'),
);
