import { defineConfig, devices } from '@playwright/test';

const runLoadTests = !!process.env.EPUMP_RUN_LOAD_TESTS;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 240000,
  forbidOnly: !!process.env.CI,
  retries: 2,
  workers: process.env.CI ? 1 : runLoadTests ? 20 : 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'html',
  outputDir: 'test-results',
  use: {
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
  },
  projects: [
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
