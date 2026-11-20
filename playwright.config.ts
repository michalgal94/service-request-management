import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// Isolate browser tests from local data.
const databasePath = resolve(`data/e2e/run-${Date.now()}-${process.pid}.sqlite`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --import tsx server/index.ts',
      env: { PORT: '3101', DATABASE_PATH: databasePath, AUTO_SEED: 'true' },
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev:client -- --port 5174',
      env: { PORT: '3101' },
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
    },
  ],
});
