import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findBannedIdentifiers } from '../scripts/check-banned-identifiers.mjs';

const roots: string[] = [];

function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'banned-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('findBannedIdentifiers', () => {
  it('finds nothing in clean source', () => {
    const root = makeRepo({
      'packages/story/src/index.ts': 'export const people = ["named by the user"];\n',
      'apps/mobile/app/index.tsx': 'export default function Index() { return null; }\n',
    });
    expect(findBannedIdentifiers(root)).toEqual([]);
  });

  it('reports file and line of an offending identifier, case-insensitively', () => {
    const root = makeRepo({
      'apps/mobile/src/services/camera.ts': 'const a = 1;\nexport const DETECTFACES = a;\n',
      'apps/api/src/providers/audio.ts': 'export function voicePrint() {}\n',
    });
    expect(findBannedIdentifiers(root).sort()).toEqual([
      'apps/api/src/providers/audio.ts:1 voicePrint',
      'apps/mobile/src/services/camera.ts:2 DETECTFACES',
    ]);
  });

  it('ignores tests and node_modules', () => {
    const root = makeRepo({
      'packages/story/src/face.test.ts': 'const faceDetect = 1;\n',
      'packages/story/src/node_modules/x/index.js': 'const speakerId = 1;\n',
      'packages/story/test/a.ts': 'const faceEmbedding = 1;\n',
    });
    expect(findBannedIdentifiers(root)).toEqual([]);
  });
});
