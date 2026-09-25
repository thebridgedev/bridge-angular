import { test as base, expect, type Page } from '@playwright/test';
import {
  type EnvironmentConfig,
  getCurrentEnvironment,
  getEnvironmentConfig,
} from '../config/environments';
import { type PlaywrightTestAccount, TestDataClient } from '../utils/test-data-client';
import { LONG_TIMEOUT, MED_TIMEOUT } from './timeouts';
import {
  BASELINE_APP_CONFIG,
  isBaselineConfig,
  markAppConfigDirty,
  takeAppConfigDirty,
  workerAppFor,
  type WorkerApp,
} from './worker-app';

export interface AuthFixtures {
  testUser: PlaywrightTestAccount;
  authenticatedPage: Page;
  envConfig: EnvironmentConfig;
  testDataClient: TestDataClient;
  /** The Bridge app this worker owns — see fixtures/worker-app.ts (TBP-721) */
  workerApp: WorkerApp;
  /**
   * Auto-use guard that puts this worker's app back on {@link BASELINE_APP_CONFIG}
   * when the previous test in this worker left it off it.
   */
  appConfigBaseline: void;
}

export const test = base.extend<AuthFixtures>({
  // The Bridge app provisioned for this worker by global-setup.
  workerApp: async ({}, use, testInfo) => {
    await use(workerAppFor(testInfo.parallelIndex));
  },

  // Every browser context in this worker boots the demo with THIS worker's app
  // id (seeded as localStorage `bridge:appId`), which is what stops one worker's
  // app-level writes from being visible to another. Overrides the config-level
  // `use.storageState`.
  storageState: async ({ workerApp }, use) => {
    await use(workerApp.storageStatePath);
  },

  // Environment configuration, narrowed to this worker's app.
  envConfig: async ({ workerApp }, use) => {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    await use({ ...config, appId: workerApp.appId, appDomain: workerApp.appDomain });
  },

  // Test data client for API operations. `configureApp` is wrapped so the
  // baseline guard below knows whether anything actually needs undoing.
  testDataClient: async ({ envConfig }, use) => {
    const client = new TestDataClient(envConfig);
    const configureApp = client.configureApp.bind(client);
    client.configureApp = async (config) => {
      if (!isBaselineConfig(config)) markAppConfigDirty();
      return configureApp(config);
    };
    await use(client);
  },

  // Restore the app-level baseline when — and only when — a previous test in
  // this worker moved off it and died before its own `finally` put it back.
  // Safe because the app is this worker's alone and tests within a worker run
  // serially; cheap because it fires only after a spec that changed something.
  appConfigBaseline: [
    async ({ testDataClient }, use) => {
      if (takeAppConfigDirty()) {
        await testDataClient.configureApp({ ...BASELINE_APP_CONFIG }).catch(() => {});
      }
      await use();
    },
    { auto: true },
  ],

  testUser: async ({ testDataClient, appConfigBaseline }, use) => {
    // Depended on, not used: orders the baseline reset before the account is
    // created, so the tenant is onboarded against the baseline app config.
    void appConfigBaseline;

    const account = await testDataClient.createTestAccount();
    console.log(`[fixture] Created test account: ${account.email}`);

    await use(account);

    try {
      await testDataClient.removeTestAccount(account.email);
      console.log(`[fixture] Removed test account: ${account.email}`);
    } catch (error: any) {
      console.warn(`[fixture] Failed to remove test account ${account.email}: ${error.message}`);
    }
  },

  authenticatedPage: async ({ page, testUser, envConfig }, use) => {
    await loginViaBridgeAuth(page, testUser.email, testUser.password, envConfig);
    await use(page);
  },
});

export { expect } from '@playwright/test';

export async function loginViaBridgeAuth(
  page: Page,
  email: string,
  password: string,
  envConfig: EnvironmentConfig,
): Promise<void> {
  console.log(`[login] Starting login for ${email}`);

  await page.goto('/');
  console.log(`[login] On home page: ${page.url()}`);

  const loginButton = page.locator('button:has-text("Login with Bridge")');
  await loginButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await loginButton.click();

  await page.waitForURL(
    (url) => {
      const urlString = url.toString();
      return urlString.includes('/auth/') || urlString.includes('/login');
    },
    { timeout: LONG_TIMEOUT },
  );

  console.log(`[login] Redirected to auth page: ${page.url()}`);

  const emailInput = page
    .locator('#email, input[name="username"], input[type="email"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const continueButton = page
    .locator('button[type="submit"]:has-text("Continue")')
    .first();
  await continueButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await continueButton.click();

  const passwordInput = page
    .locator('#password, input[name="password"], input[type="password"]')
    .first();
  await passwordInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await passwordInput.fill(password);

  const signInButton = page
    .locator('button[type="submit"]:has-text("Sign in")')
    .first();
  await signInButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await signInButton.click();

  console.log(`[login] Submitted credentials, waiting for OAuth flow...`);

  try {
    await page.waitForURL(
      (url) => {
        const urlString = url.toString();
        return (
          !urlString.includes('/auth/login') && !urlString.includes('/login')
        );
      },
      { timeout: LONG_TIMEOUT },
    );
  } catch {
    // May still be processing
  }

  // The next branch reads page.url(), so the document that redirect landed on
  // has to be parsed first. domcontentloaded says exactly that and always
  // fires; network idle never would, because the demo holds a live realtime
  // WebSocket once the SDK has booted (TBP-721, port of svelte TBP-605).
  await page.waitForLoadState('domcontentloaded');

  const currentUrl = page.url();
  if (
    currentUrl.includes('/choose-user') ||
    currentUrl.includes('/chooseTenantUser')
  ) {
    console.log(`[login] Handling choose-user page...`);
    await handleChooseUserPage(page);
  }

  await waitForOAuthFlowCompletion(page);

  const finalUrl = page.url();
  console.log(`[login] Login complete, final URL: ${finalUrl}`);

  const hasTokens = await page.evaluate(() => {
    // auth-core namespaces the storage key as `bridge_tokens:<appId>` (older
    // builds used the bare `bridge_tokens`) — match either by prefix.
    const key = Object.keys(localStorage).find(
      (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
    );
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return false;
    try {
      const tokens = JSON.parse(raw);
      return !!tokens?.accessToken;
    } catch {
      return false;
    }
  });

  if (!hasTokens) {
    throw new Error(
      `Login appeared to succeed but no tokens found in localStorage. Final URL: ${finalUrl}`,
    );
  }

  console.log(`[login] Tokens verified in localStorage`);
}

/**
 * Login via the in-app SDK auth flow (the `<bridge-login-form>` rendered on
 * `/auth/login`). Mirrors bridge-svelte/react `loginViaSdkAuth`.
 *
 * Unlike `loginViaBridgeAuth` (which redirects to hosted auth), SDK auth posts
 * credentials directly to auth-core and stores `bridge_tokens` in localStorage.
 */
export async function loginViaSdkAuth(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  console.log(`[sdk-login] Starting SDK login for ${email}`);

  await page.goto('/auth/login');

  const emailInput = page.locator('#login-email');
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const passwordInput = page.locator('#login-password');
  await passwordInput.fill(password);

  const signInBtn = page.locator('button[type="submit"]:has-text("Sign in")');
  await signInBtn.click();

  await page.waitForFunction(
    () => {
      // auth-core namespaces the key as `bridge_tokens:<appId>` — match either.
      const key = Object.keys(localStorage).find(
        (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
      );
      const raw = key ? localStorage.getItem(key) : null;
      if (!raw) return false;
      try {
        const tokens = JSON.parse(raw);
        return !!tokens?.accessToken;
      } catch {
        return false;
      }
    },
    { timeout: LONG_TIMEOUT },
  );

  await page.waitForURL('**/protected', { timeout: MED_TIMEOUT }).catch(() => {
    /* may not redirect to /protected in all configurations */
  });

  console.log(`[sdk-login] SDK login complete for ${email}. Current URL: ${page.url()}`);
}

async function handleChooseUserPage(page: Page): Promise<void> {
  const loadingSpinner = page.locator('svg.animate-spin');
  try {
    await loadingSpinner.waitFor({ state: 'hidden', timeout: LONG_TIMEOUT });
  } catch {
    // Already gone
  }

  const workspaceButtons = page.locator('button:has(h3)');
  try {
    await workspaceButtons.first().waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  } catch {
    // May auto-select
  }

  const buttonCount = await workspaceButtons.count();
  console.log(`[login] Found ${buttonCount} workspace(s) on choose-user page`);

  if (buttonCount === 0) {
    await page.waitForTimeout(2000);
    if (!page.url().includes('/choose-user')) return;
    throw new Error('No workspace buttons found on choose-user page');
  }

  const button = buttonCount === 1 ? workspaceButtons.first() : workspaceButtons.first();
  const name = await button.locator('h3').textContent().catch(() => 'Unknown');
  console.log(`[login] Selecting workspace: ${name}`);

  const navPromise = page.waitForURL(
    (url) => !url.pathname.includes('/choose-user'),
    { timeout: LONG_TIMEOUT },
  );
  await button.click();
  await navPromise;
}

async function waitForOAuthFlowCompletion(page: Page): Promise<void> {
  let redirectCount = 0;
  const maxRedirects = 10;

  while (redirectCount < maxRedirects) {
    const currentUrl = page.url();

    const isTransitPage =
      currentUrl.includes('/handover') ||
      currentUrl.includes('/auth/oauth-callback') ||
      currentUrl.includes('/auth/chooseTenantUser') ||
      currentUrl.includes('/auth/choose-user');

    if (!isTransitPage) break;

    console.log(`[login] Waiting for OAuth flow, redirect #${redirectCount}: ${currentUrl}`);

    if (
      currentUrl.includes('/choose-user') ||
      currentUrl.includes('/chooseTenantUser')
    ) {
      await handleChooseUserPage(page);
      redirectCount++;
      continue;
    }

    try {
      await page.waitForURL(
        (url) => {
          const urlString = url.toString();
          return (
            !urlString.includes('/handover') &&
            !urlString.includes('/auth/oauth-callback') &&
            !urlString.includes('/auth/chooseTenantUser')
          );
        },
        { timeout: LONG_TIMEOUT },
      );
    } catch {
      // Timeout — check state
    }

    // The loop's next pass reads page.url() to decide whether we are still on a
    // transit page, so the landed document must be parsed. domcontentloaded
    // states that and terminates; network idle cannot while the realtime
    // WebSocket is open.
    await page.waitForLoadState('domcontentloaded');
    redirectCount++;
  }

  if (redirectCount >= maxRedirects) {
    throw new Error(
      `OAuth flow exceeded maximum redirects (${maxRedirects}). URL: ${page.url()}`,
    );
  }
}
