/**
 * Global setup for bridge-angular Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * ## App id resolution (TBP-721, port of bridge-svelte TBP-606)
 *
 * The app id is resolved HERE, from the test-data API, and seeded straight into
 * the browser context's localStorage (`bridge:appId`), which the demo's
 * `app.config.ts` prefers over `environment.bridgeAppId`. That makes the suite
 * independent of the tracked `demo/src/environments/environment.test.<mode>.ts`
 * files: pre-setup used to rewrite them with a generated id on every run, which
 * dirtied the checkout, and a clean checkout booted the demo with an empty id.
 *
 * Steps:
 * 1. Validate required environment variables
 * 2. Resolve the app id from the test-data API
 * 3. Seed it into localStorage, load the demo, and verify Bridge initialized with it
 * 4. Save the storage state to base-state.json for all tests to inherit
 * 5. Purge stale playwright test accounts
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { demoBaseUrl } from './config/environments';
import { createTestDataClientFromEnv } from './utils/test-data-client';

const APP_ID_STORAGE_KEY = 'bridge:appId';

type StorageState = {
  // Playwright's own cookie shape; opaque here — global-setup never reads it.
  cookies: any[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/** The demo environment file backing the current Playwright project. */
function demoEnvFileForProject(): string {
  const project = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (project.includes('prod')) return 'demo/src/environments/environment.test.prod.ts';
  if (project.includes('stage')) return 'demo/src/environments/environment.test.stage.ts';
  return 'demo/src/environments/environment.test.local.ts';
}

/** Storage state that pins `bridge:appId` on the demo origin. */
function buildAppIdState(appId: string, baseURL: string): StorageState {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [{ name: APP_ID_STORAGE_KEY, value: appId }],
      },
    ],
  };
}

async function globalSetup() {
  console.log('\n========================================');
  console.log('  bridge-angular E2E Global Setup');
  console.log('========================================\n');

  const requiredVars = ['PLAYWRIGHT_TEST_API_KEY'];
  const missing = requiredVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
        `Copy config/.env.test.local.example to config/.env.test.local and fill in the values.`,
    );
  }

  console.log('[global-setup] Environment variables validated');

  const testDataClient = createTestDataClientFromEnv();
  const envFile = demoEnvFileForProject();
  const baseURL = demoBaseUrl();

  const testAppDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_ANGULAR_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Angular Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@thebridge.io';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  // 2. Resolve the app id for this run.
  console.log(`[global-setup] Fetching test app (domain: ${testAppDomain})...`);

  let appId: string;
  try {
    const result = await testDataClient.setupTestApp(
      testAppDomain,
      testAppName,
      ownerEmail,
      ownerPassword,
      baseURL,
    );
    appId = (result.appId || '').trim();
    if (!appId) throw new Error('setup-test-app returned an empty appId');

    process.env.BRIDGE_TEST_APP_ID = appId;
    process.env.BRIDGE_TEST_OWNER_EMAIL = result.email;
    process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

    console.log(`[global-setup] Test app ready:`);
    console.log(`[global-setup]   App ID: ${appId}`);
    console.log(`[global-setup]   Domain: ${result.domain}`);
    console.log(`[global-setup]   Owner: ${result.email}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not resolve a Bridge app id for this run.\n` +
        `The test-data API (domain: ${testAppDomain}) failed with: ${message}\n\n` +
        `Check STAGE_TEST_DATA_API_URL / PROD_TEST_DATA_API_URL / LOCAL_TEST_DATA_API_URL ` +
        `and PLAYWRIGHT_TEST_API_KEY in config/.env.test.local. To serve the demo by hand ` +
        `against a fixed app instead, set bridgeAppId in ${envFile}.`,
    );
  }

  // 3. Seed the app id into localStorage and verify the demo initializes with it.
  console.log(`[global-setup] Seeding ${APP_ID_STORAGE_KEY}=${appId} and loading demo at ${baseURL}...`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: buildAppIdState(appId, baseURL) });
  const page = await context.newPage();

  try {
    await page.goto(baseURL);

    // ConfigStatus (home page) renders the app id only once Bridge config initialized.
    const initialized = page.locator('.feature-status.active code').first();
    try {
      await initialized.waitFor({ timeout: 30_000 });
    } catch (waitError: unknown) {
      const demoMessage = await page
        .locator('.feature-status')
        .first()
        .innerText()
        .catch(() => '');
      throw new Error(
        `The demo at ${baseURL} did not initialize Bridge with app id ${appId}.\n` +
          (demoMessage ? `Demo reported: ${demoMessage.replace(/\s+/g, ' ').trim()}\n` : '') +
          `The app id was seeded into localStorage as "${APP_ID_STORAGE_KEY}".\n` +
          `Underlying wait: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
      );
    }

    const shownAppId = (await initialized.innerText()).trim();
    if (shownAppId !== appId) {
      throw new Error(
        `The demo at ${baseURL} initialized with app id ${shownAppId}, expected ${appId}.\n` +
          `Something else is pinning the app id — check demo/src/app/app.config.ts.`,
      );
    }
    console.log(`[global-setup] Demo initialized with app id ${appId}`);

    // 4. Save the storage state for all tests to inherit.
    const authDir = path.resolve(__dirname, '.auth');
    fs.mkdirSync(authDir, { recursive: true });
    const baseStatePath = path.resolve(authDir, 'base-state.json');
    await context.storageState({ path: baseStatePath });
    console.log(`[global-setup] Storage state saved to ${baseStatePath}`);
  } finally {
    await browser.close();
  }

  // 5. Purge stale test accounts from previous runs.
  try {
    const purgedCount = await testDataClient.purgeTestAccounts();
    console.log(`[global-setup] Purged ${purgedCount} stale test account(s)`);
  } catch (error: any) {
    console.warn(`[global-setup] Warning: Failed to purge test accounts: ${error.message}`);
  }

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
