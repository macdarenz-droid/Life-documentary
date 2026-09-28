// Renders the Episode composition with the fixture manifest in 9:16 and 16:9, verifies each MP4 and
// writes stills of its parts to out/frames/. `--mute-answers` mutes the answers' own sound, to show
// that the loudness check catches it.
import type { RenderManifestV2 } from '@life/contracts';
import { fixtureManifest, msToFrames } from '@life/story';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { browserExecutable, bundleProject, fail, outDir, packageRoot } from './shared.mjs';

const DURATION_TOLERANCE_MS = 200;
/** The cold open carries the answer's own sound, the closing only music. */
const MIN_LOUDNESS_GAP_LU = 3;
const framesDir = path.join(outDir, 'frames');
const muteAnswers = process.argv.includes('--mute-answers');

type Format = 'portrait' | 'landscape';
type Segment = RenderManifestV2['segments'][number];
const FORMATS: { format: Format; file: string; shape: string }[] = [
  { format: 'portrait', file: 'episode-9x16.mp4', shape: '9x16' },
  { format: 'landscape', file: 'episode-16x9.mp4', shape: '16x9' },
];

function manifestFor(format: Format): RenderManifestV2 {
  const manifest = fixtureManifest(format);
  if (!muteAnswers) return manifest;
  const mute = (s: Segment): Segment =>
    (s.kind === 'coldOpen' || s.kind === 'shot') && s.media.type === 'video'
      ? { ...s, media: { ...s.media, sound: 'none' } }
      : s;
  return { ...manifest, segments: manifest.segments.map(mute) };
}

function remotion(args: string[]): { stdout: string; stderr: string } {
  const result = spawnSync('pnpm', ['exec', 'remotion', ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(`remotion ${args[0]} failed: ${result.stderr}`);
  return { stdout: result.stdout, stderr: result.stderr };
}

/** Integrated loudness (LUFS) of [fromMs, toMs) from FFmpeg's loudnorm analysis (`input_i`). */
function loudness(file: string, fromMs: number, toMs: number): number {
  const { stderr } = remotion([
    'ffmpeg',
    '-hide_banner',
    '-nostats',
    '-ss',
    String(fromMs / 1000),
    '-t',
    String((toMs - fromMs) / 1000),
    '-i',
    file,
    '-vn',
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ]);
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  const value = Number((JSON.parse(json) as { input_i: string }).input_i);
  if (!Number.isFinite(value)) fail(`No loudness measured for ${fromMs}–${toMs} ms`);
  return value;
}

type Probe = {
  streams: { codec_type: string; width?: number; height?: number }[];
  format: { duration: string };
};

function probe(file: string): Probe {
  return JSON.parse(
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
        file,
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    ),
  ) as Probe;
}

/** The middle of the first segment that matches. */
function middleOf(m: RenderManifestV2, match: (s: Segment) => boolean): number {
  const s = m.segments.find(match);
  if (!s) return fail('The fixture manifest lacks a part it should show');
  return (s.fromMs + s.toMs) / 2;
}

/** The middle of a captioned word spoken while the first lower third shows, so the still has both. */
function captionMs(m: RenderManifestV2): number {
  const third = m.lowerThirds[0];
  if (!third) return fail('The fixture manifest has no lower third');
  const mids = m.speech
    .filter((u) => u.captions)
    .flatMap((u) => u.words.map((w) => (w.fromMs + w.toMs) / 2));
  const ms = mids.find((t) => t > third.atMs + 500 && t < third.atMs + third.durationMs - 500);
  if (ms === undefined) return fail('No captioned word is spoken under the lower third');
  return ms;
}

/** Stills of the cold open, a bridge slot, a voice answer, a lower third, the closing and a caption. */
function stillsOf(m: RenderManifestV2): [string, number][] {
  const third = m.lowerThirds[0];
  if (!third) return fail('The fixture manifest has no lower third');
  return [
    ['cold-open', middleOf(m, (s) => s.kind === 'coldOpen')],
    ['bridge', middleOf(m, (s) => s.kind === 'sceneOpen')],
    ['voice-answer', middleOf(m, (s) => s.kind === 'shot' && s.media.type === 'voice')],
    ['lower-third', third.atMs + third.durationMs / 2],
    ['closing', middleOf(m, (s) => s.kind === 'closing')],
    ['captions', captionMs(m)],
  ];
}

mkdirSync(framesDir, { recursive: true });
const serveUrl = await bundleProject();
const checks: [string, boolean][] = [];

for (const { format, file, shape } of FORMATS) {
  const manifest = manifestFor(format);
  const output = path.join(outDir, file);
  const started = performance.now();
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
  process.stdout.write(
    `render time ${elapsedS.toFixed(1)} s → ${path.relative(packageRoot, output)}\n`,
  );

  const info = probe(output);
  const video = info.streams.find((s) => s.codec_type === 'video');
  const durationMs = Math.round(Number(info.format.duration) * 1000);
  const { width, height } = manifest.format;
  checks.push(
    [
      `${shape} size ${video?.width}×${video?.height} = ${width}×${height}`,
      video?.width === width && video?.height === height,
    ],
    [
      `${shape} duration ${durationMs} ms within ±${DURATION_TOLERANCE_MS} ms of ${manifest.durationMs} ms`,
      Math.abs(durationMs - manifest.durationMs) <= DURATION_TOLERANCE_MS,
    ],
    [`${shape} has an audio stream`, info.streams.some((s) => s.codec_type === 'audio')],
  );

  if (format === 'portrait') {
    const cold = manifest.segments.find((s) => s.kind === 'coldOpen');
    const closing = manifest.segments.find((s) => s.kind === 'closing');
    if (!cold || !closing) fail('The fixture manifest lacks a cold open or a closing');
    const coldLufs = loudness(output, cold.fromMs, cold.toMs);
    const closingLufs = loudness(output, closing.fromMs, closing.toMs);
    checks.push([
      `cold open ${coldLufs.toFixed(1)} LUFS is at least ${MIN_LOUDNESS_GAP_LU} LU louder than the closing ${closingLufs.toFixed(1)} LUFS`,
      coldLufs - closingLufs >= MIN_LOUDNESS_GAP_LU,
    ]);
  }

  for (const [name, ms] of stillsOf(manifest)) {
    const still = path.join(framesDir, `${shape}-${name}.png`);
    await renderStill({
      serveUrl,
      composition,
      inputProps: manifest,
      frame: msToFrames(ms, composition.fps),
      output: still,
      browserExecutable,
    });
    process.stdout.write(`still ${path.relative(packageRoot, still)} at ${Math.round(ms)} ms\n`);
  }
}

for (const [label, ok] of checks) process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${label}\n`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0)
  fail(`Render verification failed: ${failed.map(([label]) => label).join('; ')}`);
