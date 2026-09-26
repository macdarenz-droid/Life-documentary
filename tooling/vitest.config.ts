import { defineConfig } from 'vitest/config';

// Lives in tooling/, not the repo root: Vitest looks for a config in parent folders, so a root
// config would also be picked up by every workspace's own `vitest run`.
export default defineConfig({
  test: { root: import.meta.dirname, include: ['test/**/*.test.ts'] },
});
