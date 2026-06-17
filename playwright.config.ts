import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from config/.env.test.local
dotenv.config({
  path: path.resolve(__dirname, 'config/.env.test.local'),
  override: false,
});

/**
 * Determine the Angular CLI configuration name based on the Playwright project.
 *
 *   --project=local  →  ng serve --configuration=test-local
 *   --project=stage  →  ng serve --configuration=test-stage
 *   --project=prod   →  ng serve --configuration=test-prod
 */
function getAngularConfig(): string {
  const project = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (project.includes('prod')) return 'test-prod';
  if (project.includes('stage')) return 'test-stage';
  return 'test-local';
}

// Demo dev-server port. Overridable via HARNESS_PORT / LOCAL_BASE_URL.
const HARNESS_PORT = process.env.HARNESS_PORT || '3001';
const DEFAULT_BASE_URL = `http://localhost:${HARNESS_PORT}`;

export default defineConfig({
  testDir: './e2e/playwright/tests',

  timeout: 60 * 1000,

  expect: {
    timeout: 10 * 1000,
  },

  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  retries: 0,

  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'test-reports/playwright-report' }],
    ['json', { outputFile: 'test-reports/playwright-results.json' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.LOCAL_BASE_URL || DEFAULT_BASE_URL,

    trace: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'retain-on-failure',
    screenshot: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'only-on-failure',
    video: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'retain-on-failure',

    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
  },

  projects: [
    {
      name: 'local',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'local-no-auth',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'stage',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'prod',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-reports/test-results',

  // Angular CLI cold start is slower than Vite, so use 60s timeout
  webServer: {
    command: `cd demo && npx ng serve --configuration=${getAngularConfig()} --port=${HARNESS_PORT}`,
    url: DEFAULT_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  globalSetup: require.resolve('./e2e/playwright/global-setup'),
});
