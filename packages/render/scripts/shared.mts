import { bundle } from '@remotion/bundler';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const publicDir = path.join(packageRoot, 'public');
export const fixturesDir = path.join(publicDir, 'fixtures');
export const outDir = path.join(packageRoot, 'out');

/** A local Chromium when REMOTION_BROWSER_EXECUTABLE is set (cloud containers); else Remotion's own. */
export const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;

export function bundleProject(): Promise<string> {
  return bundle({
    entryPoint: path.join(packageRoot, 'src', 'index.ts'),
    rootDir: packageRoot,
    publicDir,
  });
}

export function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
