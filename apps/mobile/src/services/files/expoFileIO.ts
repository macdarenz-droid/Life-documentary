// Byte-range files over expo-file-system (File, Directory, FileHandle). Paths are file URIs.
import { Directory, File, FileMode } from 'expo-file-system';
import type { FileIO } from '../../domain/ports';

export const expoFileIO: FileIO = {
  exists: async (path) => new File(path).exists,
  size: async (path) => new File(path).info().size ?? 0,
  read: async (path, offset, length) => {
    const handle = new File(path).open(FileMode.ReadOnly);
    try {
      handle.offset = offset;
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  },
  append: async (path, bytes) => {
    const file = new File(path);
    if (!file.exists) file.create({ intermediates: true });
    const handle = file.open(FileMode.Append);
    try {
      handle.writeBytes(bytes);
    } finally {
      handle.close();
    }
  },
  remove: async (path) => {
    const file = new File(path);
    if (file.exists) file.delete();
  },
  move: async (from, to) => {
    const target = new File(to);
    if (target.exists) target.delete();
    await new File(from).move(target);
  },
  list: async (dir) => {
    const directory = new Directory(dir);
    if (!directory.exists) return [];
    return directory.list().flatMap((entry) => (entry instanceof File ? [entry.uri] : []));
  },
  ensureDir: async (dir) => {
    new Directory(dir).create({ intermediates: true, idempotent: true });
  },
};
