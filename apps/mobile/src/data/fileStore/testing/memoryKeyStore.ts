import type { KeyStore } from '../../../domain/ports';

export function memoryKeyStore(): KeyStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => {
      values.set(name, value);
    },
    remove: async (name) => {
      values.delete(name);
    },
  };
}
