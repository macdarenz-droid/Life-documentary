import { defineConfig } from 'vitest/config';

// The planner evaluation (T-014d) runs in Node, never in the Workers pool, and only on demand.
export default defineConfig({
  test: {
    include: ['eval/**/*.eval.ts'],
    environment: 'node',
    testTimeout: 60 * 60 * 1000,
  },
});
