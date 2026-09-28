// Generates every fixture file in public/fixtures. Nothing is downloaded and nothing is licensed.
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { browserExecutable, bundleProject, fixturesDir } from './shared.mjs';

const SAMPLE_RATE = 48_000;
/** A fixture answer, video or voice, lasts 4 s. */
const ANSWER_SECONDS = 4;
const force = process.argv.includes('--force');

/** 16-bit PCM WAV from per-channel sample functions returning values in [-1, 1]. */
function wav(seconds: number, channels: ((t: number) => number)[]): Buffer {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const dataBytes = frames * channels.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels.length, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * channels.length * 2, 28);
  buf.writeUInt16LE(channels.length * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    for (const channel of channels) {
      const v = Math.max(-1, Math.min(1, channel(t)));
      buf.writeInt16LE(Math.round(v * 32767), offset);
      offset += 2;
    }
  }
  return buf;
}

const TAU = 2 * Math.PI;
// 220 Hz tone shaped by a 4 Hz envelope, so it reads as syllables.
const voice = (t: number) => 0.5 * Math.sin(TAU * 220 * t) * (0.5 - 0.5 * Math.cos(TAU * 4 * t));
// A soft A-major chord.
const chord = (t: number) =>
  0.12 * (Math.sin(TAU * 220 * t) + Math.sin(TAU * 277.18 * t) + Math.sin(TAU * 329.63 * t));

function needs(file: string): boolean {
  const skip = existsSync(file) && !force;
  if (skip) process.stdout.write(`skip ${path.basename(file)} (exists)\n`);
  return !skip;
}

mkdirSync(fixturesDir, { recursive: true });

const voiceFile = path.join(fixturesDir, 'voice.wav');
if (needs(voiceFile)) {
  writeFileSync(voiceFile, wav(2.5, [voice]));
  process.stdout.write('wrote voice.wav\n');
}

const answerVoiceFile = path.join(fixturesDir, 'answer-voice.wav');
if (needs(answerVoiceFile)) {
  writeFileSync(answerVoiceFile, wav(ANSWER_SECONDS, [voice]));
  process.stdout.write('wrote answer-voice.wav\n');
}

const musicFile = path.join(fixturesDir, 'music.wav');
if (needs(musicFile)) {
  writeFileSync(musicFile, wav(32, [chord, chord]));
  process.stdout.write('wrote music.wav\n');
}

const clipFile = path.join(fixturesDir, 'clip.mp4');
const photoFile = path.join(fixturesDir, 'photo.jpg');
const renderClip = needs(clipFile);
const answerFile = path.join(fixturesDir, 'answer.mp4');
const renderPhoto = needs(photoFile);
const renderAnswer = needs(answerFile);

if (renderClip || renderPhoto || renderAnswer) {
  const serveUrl = await bundleProject();
  if (renderClip) {
    const composition = await selectComposition({ serveUrl, id: 'FixtureClip', browserExecutable });
    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      outputLocation: clipFile,
      browserExecutable,
    });
    process.stdout.write('wrote clip.mp4\n');
  }
  if (renderAnswer) {
    const composition = await selectComposition({
      serveUrl,
      id: 'FixtureAnswer',
      browserExecutable,
    });
    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      outputLocation: answerFile,
      browserExecutable,
    });
    process.stdout.write('wrote answer.mp4\n');
  }
  if (renderPhoto) {
    const composition = await selectComposition({
      serveUrl,
      id: 'FixturePhoto',
      browserExecutable,
    });
    await renderStill({
      serveUrl,
      composition,
      output: photoFile,
      imageFormat: 'jpeg',
      browserExecutable,
    });
    process.stdout.write('wrote photo.jpg\n');
  }
}
