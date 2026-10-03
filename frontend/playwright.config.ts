import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the console, run against the production build.
 *
 *   npm run e2e    desktop (1440) and phone (390) projects, every spec but shots
 *   npm run shots  the deck screenshots only (e2e/shots.spec.ts, tagged @shots)
 *
 * The browser: Playwright's own Chromium for the installed @playwright/test
 * version, found through PLAYWRIGHT_BROWSERS_PATH as usual. To point at a
 * different binary instead, set PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */

const PORT = Number(process.env.E2E_PORT ?? 4317);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

const chromium = {
  ...devices['Desktop Chrome'],
  launchOptions: executablePath ? { executablePath } : {},
};

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  // Each test builds its own world (the seed runs the real circuits at page
  // load), so tests are independent and can run side by side.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /shots\.spec\.ts/,
      use: { ...chromium, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      testIgnore: /shots\.spec\.ts/,
      use: {
        ...chromium,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // Deck screenshots: run only through `npm run shots`.
      name: 'shots',
      testMatch: /shots\.spec\.ts/,
      use: {
        ...chromium,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        // Behind an intercepting proxy (as in a cloud sandbox) Google Fonts
        // fails certificate checks, and the shots would fall back to system
        // fonts. The deck wants the real typeface; nothing else is fetched.
        ignoreHTTPSErrors: true,
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
