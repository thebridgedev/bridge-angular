import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Token Persistence', () => {
  test('tokens survive page reload', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const tokensBefore = await page.evaluate(() => {
      const __k = Object.keys(localStorage).find(
        (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
      );
      const raw = __k ? localStorage.getItem(__k) : null;
      return raw ? JSON.parse(raw) : null;
    });

    expect(tokensBefore).not.toBeNull();
    expect(tokensBefore.accessToken).toBeTruthy();

    await page.reload();

    // The claim under test is that the reloaded app comes back authenticated, so
    // wait for the authenticated nav before reading storage — not for the network
    // to go idle, which the realtime WebSocket never lets happen.
    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    const tokensAfter = await page.evaluate(() => {
      const __k = Object.keys(localStorage).find(
        (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
      );
      const raw = __k ? localStorage.getItem(__k) : null;
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

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    await page.reload();

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });

  test('protected page is accessible after reload', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/protected');

    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    await page.reload();

    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(page.locator('text=You are currently authenticated')).toBeVisible();
  });
});
