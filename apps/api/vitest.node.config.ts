import { defineConfig } from 'vitest/config';

// The Node test project: tests that need Node packages the Workers pool cannot load, such as Remotion's own
// Lambda client for comparing payloads.
export default defineConfig({
  test: { include: ['test-node/**/*.test.ts'], environment: 'node' },
});
