/**
 * Pre-setup script for bridge-angular E2E tests.
 *
 * Runs BEFORE Playwright starts to:
 * 1. Health-check the test-data API, so a wrong URL or key fails before the
 *    demo is even compiled
 * 2. Create or get the persistent test app (idempotent)
 *
 * It no longer writes the app id into `demo/src/environments/environment.test.<mode>.ts`.
 * That file is tracked, so every run dirtied the checkout with a generated id
 * — and a clean checkout had to run this first or the demo booted with an
 * empty app id. The demo now prefers `localStorage['bridge:appId']`, which
 * `global-setup.ts` resolves and seeds per Playwright worker (TBP-721, the
 * Angular port of bridge-svelte's TBP-606).
 *
 * Usage: npx tsx e2e/playwright/pre-setup.ts [mode]
 *   mode: test.local (default), test.stage, test.prod
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  DEFAULT_PROD_API_BASE_URL,
  DEFAULT_STAGE_API_BASE_URL,
  demoBaseUrl,
} from './config/environments';

const rootDir = path.resolve(__dirname, '../..');
dotenv.config({
  path: path.resolve(rootDir, 'config/.env.test.local'),
  override: false,
});

async function preSetup() {
  const mode = process.argv[2] || 'test.local';

  console.log(`[pre-setup] Mode: ${mode}`);

  if (!process.env.PLAYWRIGHT_TEST_API_KEY) {
    throw new Error(
      'PLAYWRIGHT_TEST_API_KEY is not set.\n' +
        'Copy config/.env.test.local.example to config/.env.test.local and fill in the values.',
    );
  }

  // Determine test data API URL based on mode
  let testDataApiUrl: string;
  if (mode.includes('prod')) {
    testDataApiUrl = process.env.PROD_TEST_DATA_API_URL || DEFAULT_PROD_API_BASE_URL;
  } else if (mode.includes('stage')) {
    testDataApiUrl = process.env.STAGE_TEST_DATA_API_URL || DEFAULT_STAGE_API_BASE_URL;
  } else {
    testDataApiUrl = process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
  }

  const apiKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  const testAppDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_ANGULAR_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Angular Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@thebridge.io';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  // Health check
  console.log(`[pre-setup] Health-checking test data API at ${testDataApiUrl}...`);
  const healthRes = await fetch(`${testDataApiUrl}/account/test/playwright/health`, {
    method: 'GET',
    headers: { 'x-playwright-api-key': apiKey },
  });

  if (!healthRes.ok) {
    throw new Error(
      `Test data API health check failed (${healthRes.status}). Is bridge-api running?`,
    );
  }
  console.log(`[pre-setup] Health check passed`);

  // Create or get the test app
  console.log(`[pre-setup] Setting up test app (domain: ${testAppDomain})...`);
  const setupRes = await fetch(`${testDataApiUrl}/account/test/playwright/setup-test-app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-playwright-api-key': apiKey,
    },
    body: JSON.stringify({
      domain: testAppDomain,
      appName: testAppName,
      ownerEmail,
      ownerPassword,
      // Honor LOCAL_BASE_URL / HARNESS_PORT so the registered callback origin
      // matches where the demo actually serves (playwright.config.ts webServer).
      appUrl: demoBaseUrl(),
    }),
  });

  if (!setupRes.ok) {
    const error = await setupRes.text();
    throw new Error(`Failed to setup test app: ${setupRes.status} ${error}`);
  }

  const result = await setupRes.json();
  const appId = result.appId;

  console.log(`[pre-setup] Test app ready:`);
  console.log(`[pre-setup]   App ID: ${appId}`);
  console.log(`[pre-setup]   Domain: ${result.domain}`);
  console.log(`[pre-setup]   Owner: ${result.email}`);

  console.log(
    `\n[pre-setup] Done. global-setup seeds this app id into the browser — ` +
      `no demo environment file is written.\n`,
  );
}

preSetup().catch((err) => {
  console.error(`[pre-setup] Fatal error: ${err.message}`);
  process.exit(1);
});
