// Fails when source code names a biometric capability (CLAUDE.md rule 7). Run with `pnpm banned`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const BANNED_IDENTIFIERS = [
  'faceDetect',
  'FaceDetector',
  'faceEmbedding',
  'speakerId',
  'voiceprint',
  'detectFaces',
];

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SKIPPED_DIRS = new Set(['node_modules', 'test', '__tests__', 'dist', '.expo']);

function listDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(path, entry.name));
  } catch {
    return [];
  }
}

/** The source roots under a repo root: apps/*\/src, apps/mobile/app, packages/*\/src. */
export function sourceRoots(root) {
  return [
    ...listDirs(join(root, 'apps')).map((app) => join(app, 'src')),
    join(root, 'apps', 'mobile', 'app'),
    ...listDirs(join(root, 'packages')).map((pkg) => join(pkg, 'src')),
  ];
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* walk(path);
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      yield path;
    }
  }
}

/** Returns every `file:line identifier` hit under the source roots of `root`, paths relative to root. */
export function findBannedIdentifiers(root) {
  const pattern = new RegExp(BANNED_IDENTIFIERS.join('|'), 'i');
  const hits = [];
  for (const dir of sourceRoots(root)) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const file of walk(dir)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const match = pattern.exec(line);
          if (match) hits.push(`${relative(root, file)}:${index + 1} ${match[0]}`);
        });
    }
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hits = findBannedIdentifiers(process.cwd());
  if (hits.length > 0) {
    process.stderr.write(
      `Banned biometric identifiers found (CLAUDE.md rule 7):\n${hits.join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write('No banned identifiers found.\n');
}
