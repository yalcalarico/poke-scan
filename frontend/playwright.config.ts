import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  outputDir: './.playwright-output/results',
  preserveOutput: 'never',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    serviceWorkers: 'block',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/browser-runner.mjs serve',
    url: 'http://127.0.0.1:3100/login?next=escanear',
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
  },
});
