// Playwright tests against one build of src/ (tests/support/global-setup.js). npm test runs them all.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  globalSetup: './tests/support/global-setup.js',
  fullyParallel: true,
  workers: 3, // the tests wait on real timers, so a busy machine makes them flaky: keep the pool small
  timeout: 180_000, // a few scenarios sit through several slow mock replies on purpose
  reporter: 'list',
  use: { browserName: 'chromium', headless: true },
});
