// Files in memory, recording every read so tests can check the streaming.
import type { FileIO } from '../../../domain/ports';

export type MemoryFileIO = FileIO & {
  files: Map<string, Uint8Array>;
  reads: { path: string; offset: number; length: number }[];
};

export function memoryFileIO(): MemoryFileIO {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  const reads: MemoryFileIO['reads'] = [];
  const need = (path: string) => {
    const file = files.get(path);
    if (!file) throw new Error(`No such file: ${path}`);
    return file;
  };
  return {
    files,
    reads,
    exists: async (path) => files.has(path),
    size: async (path) => need(path).length,
    read: async (path, offset, length) => {
      reads.push({ path, offset, length });
      return need(path).slice(offset, offset + length);
    },
    append: async (path, bytes) => {
      const current = files.get(path) ?? new Uint8Array(0);
      const next = new Uint8Array(current.length + bytes.length);
      next.set(current, 0);
      next.set(bytes, current.length);
      files.set(path, next);
    },
    remove: async (path) => {
      files.delete(path);
    },
    list: async (dir) =>
      [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
        .sort(),
    ensureDir: async (dir) => {
      dirs.add(dir);
    },
  };
}
