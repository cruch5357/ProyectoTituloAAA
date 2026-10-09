import { defineConfig } from '@playwright/test';
require('./backend/node_modules/dotenv').config({ path: 'backend/.env', quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for isolated browser fixtures');

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: { baseURL: 'http://localhost:5175', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    { command: 'npm run start --prefix backend', url: 'http://localhost:3101/api/v1/health/ready', reuseExistingServer: false, timeout: 90000,
      env: { NODE_ENV: 'test', PORT: '3101', ALLOWED_ORIGIN: 'http://localhost:5175', FRONTEND_URL: 'http://localhost:5175', AUTH_THROTTLE_LIMIT: '1000', JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'browser-test-only-access-secret-no-production' } },
    { command: 'npm run dev --prefix frontend -- --host localhost --port 5175 --strictPort', url: 'http://localhost:5175', reuseExistingServer: false,
      env: { VITE_API_URL: 'http://localhost:3101/api/v1' } },
  ],
});
