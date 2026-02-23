import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Token Persistence', () => {
  test('tokens survive page reload', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const tokensBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      return raw ? JSON.parse(raw) : null;
    });

    expect(tokensBefore).not.toBeNull();
    expect(tokensBefore.accessToken).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');

    const tokensAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      return raw ? JSON.parse(raw) : null;
    });

    expect(tokensAfter).not.toBeNull();
    expect(tokensAfter.accessToken).toBeTruthy();
    expect(tokensAfter.refreshToken).toBeTruthy();
  });

  test('user remains authenticated after page reload', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });

  test('protected page is accessible after reload', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/protected');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(page.locator('text=You are currently authenticated')).toBeVisible();
  });
});
