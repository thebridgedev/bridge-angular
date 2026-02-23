import { test as base, expect, type Page } from '@playwright/test';
import {
  type EnvironmentConfig,
  getCurrentEnvironment,
  getEnvironmentConfig,
} from '../config/environments';
import { type PlaywrightTestAccount, TestDataClient } from '../utils/test-data-client';
import { LONG_TIMEOUT, MED_TIMEOUT } from './timeouts';

export interface AuthFixtures {
  testUser: PlaywrightTestAccount;
  authenticatedPage: Page;
  envConfig: EnvironmentConfig;
  testDataClient: TestDataClient;
}

export const test = base.extend<AuthFixtures>({
  envConfig: async ({}, use) => {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    await use(config);
  },

  testDataClient: async ({ envConfig }, use) => {
    const client = new TestDataClient(envConfig);
    await use(client);
  },

  testUser: async ({ testDataClient }, use) => {
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
  await page.waitForLoadState('networkidle');
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

  await page.waitForLoadState('networkidle');

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
    const raw = localStorage.getItem('bridge_tokens');
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

    await page.waitForLoadState('networkidle');
    redirectCount++;
  }

  if (redirectCount >= maxRedirects) {
    throw new Error(
      `OAuth flow exceeded maximum redirects (${maxRedirects}). URL: ${page.url()}`,
    );
  }
}
