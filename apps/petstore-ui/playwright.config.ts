import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Workers inherit this run-specific directory; retries never fetch a newer catalog.
process.env['PETSTORE_E2E_RUN_DIR'] ??= resolve(__dirname, 'test-results/catalog', randomUUID());

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4202',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'catalog-setup', testMatch: /catalog\.setup\.ts/, retries: 0, timeout: 35_000 },
    { name: 'harness', testMatch: /harness\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      testMatch: /pets\.spec\.ts/,
      dependencies: ['catalog-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start -- --host localhost --port 4202 --proxy-config e2e/proxy.conf.json',
    url: 'http://localhost:4202',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
