import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// The test pool applies the D1 migrations (test/setup.ts), gets a throwaway auth secret and uses the
// fixture model providers.
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // No remote sessions: the `ai` binding would otherwise need a Cloudflare login and bill the account.
      remoteBindings: false,
      miniflare: {
        // A second, empty database for the migration test.
        d1Databases: ['MIGRATION_DB'],
        bindings: {
          BETTER_AUTH_SECRET: 'test-only-secret-not-used-anywhere-else-0123456789',
          TEST_MIGRATIONS: migrations,
          PROVIDERS: 'fixture',
          // Fixed, fake R2 credentials: presigning is pure signing, so no test reaches R2's S3 endpoint.
          R2_ACCOUNT_ID: 'testaccount0123456789',
          R2_ACCESS_KEY_ID: 'test-access-key-id',
          R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
          NARRATOR_VOICES: JSON.stringify({
            'narrator-1': 'fixture-voice-1',
            'narrator-2': 'fixture-voice-2',
            'narrator-3': 'fixture-voice-3',
            'narrator-4': 'fixture-voice-4',
          }),
        },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
