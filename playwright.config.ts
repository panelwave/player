import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the PanelWave player.
 *
 * Tests drive the demo app (projects/demo), which embeds the player library
 * exactly like a real host would. The dev server is started automatically on
 * a dedicated port so a running `npm start` (:4200) is never disturbed.
 *
 * Run:  npm run e2e            (chromium desktop + mobile emulation)
 *       npm run e2e:all        (additionally firefox + webkit)
 *       npm run e2e:ui         (interactive UI mode)
 */

const PORT = 4222;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: /mobile\..*\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /mobile\..*\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile',
      testMatch: /mobile\..*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npx ng serve demo --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
  },
});
