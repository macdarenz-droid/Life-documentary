import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// The test pool applies the D1 migrations (test/setup.ts) and gets a throwaway auth secret.
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // A second, empty database for the migration test.
        d1Databases: ['MIGRATION_DB'],
        bindings: {
          BETTER_AUTH_SECRET: 'test-only-secret-not-used-anywhere-else-0123456789',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
