/**
 * Global setup for bridge-angular Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * ## One Bridge app per worker (TBP-721, port of bridge-svelte TBP-604)
 *
 * `paymentsAutoRedirect`, `stripeEnabled`, the SSO flags and the plan catalogue
 * live on the **app**, not the tenant. With every worker pointed at one shared
 * app, a spec that wrote one of them wrote a value every other worker could
 * read, and the suite raced itself. So this file provisions one app per
 * Playwright worker — idempotent by domain, reused across runs — and writes:
 *
 *   - `.auth/worker-apps.json`       the manifest fixtures resolve their app from
 *   - `.auth/worker-<i>-state.json`  storage state seeding that app's `bridge:appId`
 *
 * Worker 0 keeps the unsuffixed domain, so `--workers=1` targets exactly the app
 * this suite has always used.
 *
 * ## App id resolution
 *
 * The app id is resolved HERE, from the test-data API, and seeded straight into
 * the browser context's localStorage (`bridge:appId`), which the demo's
 * `app.config.ts` prefers over `environment.bridgeAppId`. The tracked
 * `demo/src/environments/environment.test.<mode>.ts` files are never written.
 *
 * Steps:
 * 1. Validate required environment variables
 * 2. Provision one app per worker and ensure the plans every spec relies on
 * 3. Write the manifest + per-worker storage states
 * 4. Load the demo with worker 0's app id and verify Bridge initialized with it
 * 5. Warm the reusable paywall plan on each app, and purge stale test accounts
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { demoBaseUrl } from './config/environments';
import { PAYWALL_PLAN, TEAM_PLAN } from './fixtures/plans';
import {
  BASELINE_APP_CONFIG,
  workerAppDomain,
  workerAppOwnerEmail,
  workerStorageStatePath,
  writeWorkerApps,
  type WorkerApp,
} from './fixtures/worker-app';
import { TestDataClient, createTestDataClientFromEnv } from './utils/test-data-client';

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

/**
 * A test-data client bound to one worker's app domain. Deliberately NOT built
 * from `getEnvironmentConfig()`: that requires `BRIDGE_TEST_APP_ID`, which does
 * not exist yet at the point this file provisions the apps that define it.
 */
function clientForDomain(appDomain: string): TestDataClient {
  return createTestDataClientFromEnv(appDomain);
}

/**
 * Provision (or re-resolve) one worker's app and write its storage state.
 *
 * `setup-test-app` is idempotent by domain: the first run creates the app with
 * its seeded plans and OAuth config, every later run just refreshes that config.
 */
async function provisionWorkerApp(
  parallelIndex: number,
  opts: { baseDomain: string; baseName: string; ownerPassword: string; baseURL: string },
): Promise<WorkerApp> {
  const appDomain = workerAppDomain(opts.baseDomain, parallelIndex);
  const ownerEmail =
    parallelIndex === 0
      ? process.env.TEST_OWNER_EMAIL || workerAppOwnerEmail(0)
      : workerAppOwnerEmail(parallelIndex);
  const appName =
    parallelIndex === 0 ? opts.baseName : `${opts.baseName} (worker ${parallelIndex})`;

  const client = clientForDomain(appDomain);
  const result = await client.setupTestApp(
    appDomain,
    appName,
    ownerEmail,
    opts.ownerPassword,
    opts.baseURL,
  );
  const appId = (result.appId || '').trim();
  if (!appId) {
    throw new Error(`setup-test-app returned an empty appId for domain ${appDomain}`);
  }

  // Put the app back on the baseline every test is entitled to assume — an
  // interrupted previous run may have left Stripe or the paywall switched on —
  // and make sure the TEAM trial plan exists. Every `testUser` is bound to it,
  // so without it account creation 404s and takes most of the suite with it.
  await client.configureApp({ ...BASELINE_APP_CONFIG });
  const team = await client.ensurePlan({ ...TEAM_PLAN });
  if (team.created) {
    console.log(`[global-setup] ${appDomain}: created missing ${TEAM_PLAN.key} plan`);
  }

  const storageStatePath = workerStorageStatePath(parallelIndex);
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(
    storageStatePath,
    JSON.stringify(buildAppIdState(appId, opts.baseURL), null, 2),
  );

  return { parallelIndex, appId, appDomain, ownerEmail, storageStatePath };
}

/**
 * Create the stable paywall plan (and its Stripe price) on an app ahead of the
 * run, so `welcome-paywall.spec.ts` never has to create-then-immediately-check-out
 * against a price bridge-api is still syncing. Idempotent: on every run after the
 * first, `ensure-plan` returns the existing plan without re-running the sync.
 */
async function warmPaywallPlan(app: WorkerApp): Promise<void> {
  const pk = process.env.STRIPE_TEST_PK || '';
  const sk = process.env.STRIPE_TEST_SK || '';
  if (!pk || !sk) return; // welcome-paywall skips itself without these

  const client = clientForDomain(app.appDomain);
  try {
    await client.configureApp({
      stripeEnabled: true,
      stripePublicKey: pk,
      stripeSecretKey: sk,
      currency: PAYWALL_PLAN.currency,
    });
    const result = await client.ensurePlan({ ...PAYWALL_PLAN.definition });
    if (result.created) {
      console.log(`[global-setup] ${app.appDomain}: created paywall plan ${PAYWALL_PLAN.key}`);
    }
  } catch (error: any) {
    console.warn(
      `[global-setup] ${app.appDomain}: paywall plan warm-up failed (${error.message}) — ` +
        `welcome-paywall will provision it itself.`,
    );
  } finally {
    // Leave the app on the baseline every test is entitled to assume.
    await client.configureApp({ ...BASELINE_APP_CONFIG }).catch(() => {});
  }
}

async function globalSetup(config: FullConfig) {
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

  const envFile = demoEnvFileForProject();
  const baseURL = demoBaseUrl();
  const baseDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_ANGULAR_TEST_DASHBOARD';
  const baseName = process.env.TEST_APP_NAME || 'Bridge Angular Test Dashboard';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  // 2. Provision one app per worker. `config.workers` is the resolved count for
  //    this run, so `--workers N` sizes the pool automatically.
  const workerCount = Math.max(1, config.workers || 1);
  console.log(
    `[global-setup] Provisioning ${workerCount} worker app(s) from base domain ${baseDomain}...`,
  );

  let workerApps: WorkerApp[];
  try {
    workerApps = await Promise.all(
      Array.from({ length: workerCount }, (_, i) =>
        provisionWorkerApp(i, { baseDomain, baseName, ownerPassword, baseURL }),
      ),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not provision the per-worker Bridge apps for this run.\n` +
        `The test-data API failed with: ${message}\n\n` +
        `Check STAGE_TEST_DATA_API_URL / PROD_TEST_DATA_API_URL / LOCAL_TEST_DATA_API_URL ` +
        `and PLAYWRIGHT_TEST_API_KEY in config/.env.test.local. To serve the demo by hand ` +
        `against a fixed app instead, set bridgeAppId in ${envFile}.`,
    );
  }

  // 3. Manifest for the fixtures.
  writeWorkerApps(workerApps);
  for (const app of workerApps) {
    console.log(`[global-setup]   worker ${app.parallelIndex}: ${app.appDomain} → ${app.appId}`);
  }

  // Worker 0's app is the one the demo is booted with below, and the one any
  // code reading BRIDGE_TEST_APP_ID (e.g. getEnvironmentConfig's required-var
  // check) falls back to. Worker processes inherit this env.
  const primary = workerApps[0];
  process.env.BRIDGE_TEST_APP_ID = primary.appId;
  process.env.BRIDGE_TEST_OWNER_EMAIL = primary.ownerEmail;
  process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

  // 4. Load the demo with worker 0's app id and verify it initializes with it.
  console.log(
    `[global-setup] Seeding ${APP_ID_STORAGE_KEY}=${primary.appId} and loading demo at ${baseURL}...`,
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: buildAppIdState(primary.appId, baseURL),
  });
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
        `The demo at ${baseURL} did not initialize Bridge with app id ${primary.appId}.\n` +
          (demoMessage ? `Demo reported: ${demoMessage.replace(/\s+/g, ' ').trim()}\n` : '') +
          `The app id was seeded into localStorage as "${APP_ID_STORAGE_KEY}".\n` +
          `Underlying wait: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
      );
    }

    const shownAppId = (await initialized.innerText()).trim();
    if (shownAppId !== primary.appId) {
      throw new Error(
        `The demo at ${baseURL} initialized with app id ${shownAppId}, expected ${primary.appId}.\n` +
          `Something else is pinning the app id — check demo/src/app/app.config.ts.`,
      );
    }
    console.log(`[global-setup] Demo initialized with app id ${primary.appId}`);

    // `base-state.json` is the config-level default (playwright.config.ts
    // `use.storageState`), used by anything that has not opted into the
    // per-worker fixtures. Keep it pointing at worker 0's app.
    const baseStatePath = path.resolve(path.dirname(primary.storageStatePath), 'base-state.json');
    fs.writeFileSync(baseStatePath, JSON.stringify(buildAppIdState(primary.appId, baseURL), null, 2));
    console.log(`[global-setup] Storage state saved to ${baseStatePath}`);
  } finally {
    await browser.close();
  }

  // 5. Warm the reusable paywall plan and purge stale accounts, per app.
  //    Serial on purpose: the Stripe price sync behind `ensure-plan` is rate
  //    limited per Stripe account, and this is a once-per-run cost anyway.
  for (const app of workerApps) {
    await warmPaywallPlan(app);
  }

  await Promise.all(
    workerApps.map(async (app) => {
      try {
        const purgedCount = await clientForDomain(app.appDomain).purgeTestAccounts();
        if (purgedCount > 0) {
          console.log(`[global-setup] ${app.appDomain}: purged ${purgedCount} stale test account(s)`);
        }
      } catch (error: any) {
        console.warn(`[global-setup] ${app.appDomain}: failed to purge test accounts: ${error.message}`);
      }
    }),
  );

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
