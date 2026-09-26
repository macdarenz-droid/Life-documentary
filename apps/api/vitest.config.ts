import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// The workerd bundled with @cloudflare/vitest-pool-workers 0.22.0 supports compatibility dates
// up to 2026-08-22, earlier than the 2026-09-01 in wrangler.jsonc. Tests run on that newest
// supported date; deploys keep the wrangler.jsonc date.
const TEST_COMPATIBILITY_DATE = '2026-08-22';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { compatibilityDate: TEST_COMPATIBILITY_DATE },
    }),
  ],
});
