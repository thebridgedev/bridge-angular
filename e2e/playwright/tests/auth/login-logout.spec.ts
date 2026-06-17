import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { loginViaBridgeAuth } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Login & Logout Flow', () => {
  test('clicking "Login with Bridge" redirects to bridge auth URL', async ({ browser }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const loginButton = page.locator('button:has-text("Login with Bridge")');
      await expect(loginButton).toBeVisible({ timeout: MED_TIMEOUT });
      await loginButton.click();

      await page.waitForURL(
        (url) => {
          const urlString = url.toString();
          return urlString.includes('/auth/') || urlString.includes('/login');
        },
        { timeout: LONG_TIMEOUT },
      );

      const authUrl = page.url();
      expect(authUrl).toMatch(/\/auth\/|\/login/);
    } finally {
      await cleanup();
    }
  });

  test('after login, navbar shows authenticated navigation links', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('a.nav-link:has-text("Home")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(page.locator('a.nav-link:has-text("Team Management")')).toBeVisible();
    await expect(page.locator('a.nav-link:has-text("Protected Page")')).toBeVisible();

    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
    await expect(
      page.locator('button:has-text("Login with Bridge")'),
    ).not.toBeVisible();
  });

  test('logout clears tokens and shows login button again', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    await page.locator('button:has-text("Logout")').click();
    await page.waitForLoadState('networkidle');

    const hasTokens = await page.evaluate(() => {
      const __k = Object.keys(localStorage).find(
        (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
      );
      const raw = __k ? localStorage.getItem(__k) : null;
      if (!raw) return false;
      try {
        const tokens = JSON.parse(raw);
        return !!tokens?.accessToken;
      } catch {
        return false;
      }
    });

    expect(hasTokens).toBe(false);
  });

  test('full login flow via UI creates valid tokens', async ({
    browser,
    testUser,
    envConfig,
  }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await loginViaBridgeAuth(page, testUser.email, testUser.password, envConfig);

      const tokenData = await page.evaluate(() => {
        const __k = Object.keys(localStorage).find(
          (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
        );
        const raw = __k ? localStorage.getItem(__k) : null;
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      });

      expect(tokenData).not.toBeNull();
      expect(tokenData.accessToken).toBeTruthy();
      expect(tokenData.refreshToken).toBeTruthy();
      expect(tokenData.idToken).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
