import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const viewport = { width: 430, height: 932 };
// CI installs Playwright's Chromium; a container with a preinstalled one can point at it instead.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: 'apps/mobile/e2e',
  timeout: 90_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    viewport,
    video: { mode: 'on', size: viewport },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'node apps/mobile/e2e/serve.mjs',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: { LAB_PORT: String(port) },
  },
});
