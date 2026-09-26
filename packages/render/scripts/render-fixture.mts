// Renders the Episode composition with the fixture manifest and verifies the MP4.
import { fixtureManifest, manifestDurationMs } from '@life/story';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { browserExecutable, bundleProject, fail, outDir, packageRoot } from './shared.mjs';

const DURATION_TOLERANCE_MS = 200;
const output = path.join(outDir, 'fixture.mp4');
const manifest = fixtureManifest();

mkdirSync(outDir, { recursive: true });
const started = performance.now();

const serveUrl = await bundleProject();
const composition = await selectComposition({
  serveUrl,
  id: 'Episode',
  inputProps: manifest,
  browserExecutable,
});
await renderMedia({
  serveUrl,
  composition,
  inputProps: manifest,
  codec: 'h264',
  crf: 23,
  outputLocation: output,
  browserExecutable,
});

const elapsedS = (performance.now() - started) / 1000;

type Probe = {
  streams: { codec_type: string; width?: number; height?: number }[];
  format: { duration: string };
};
const probe = JSON.parse(
  execFileSync(
    'pnpm',
    [
      'exec',
      'remotion',
      'ffprobe',
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      output,
    ],
    { cwd: packageRoot, encoding: 'utf8' },
  ),
) as Probe;

const video = probe.streams.find((s) => s.codec_type === 'video');
const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
const durationMs = Math.round(Number(probe.format.duration) * 1000);
const expectedMs = manifestDurationMs(manifest);

const checks: [string, boolean][] = [
  [`width ${video?.width} = 1080`, video?.width === 1080],
  [`height ${video?.height} = 1920`, video?.height === 1920],
  [
    `duration ${durationMs} ms within ±${DURATION_TOLERANCE_MS} ms of ${expectedMs} ms`,
    Math.abs(durationMs - expectedMs) <= DURATION_TOLERANCE_MS,
  ],
  ['has an audio stream', hasAudio],
];

for (const [label, ok] of checks) process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${label}\n`);
process.stdout.write(
  `render time ${elapsedS.toFixed(1)} s → ${path.relative(packageRoot, output)}\n`,
);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0)
  fail(`Render verification failed: ${failed.map(([label]) => label).join('; ')}`);
