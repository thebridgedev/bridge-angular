import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Team Management', () => {
  test('/team page renders the Team Management heading', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1:has-text("Team Management")');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('/team page loads the TeamManagement iframe', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('/team page iframe has a valid src URL', async ({
    authenticatedPage,
    envConfig,
  }) => {
    const page = authenticatedPage;

    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: LONG_TIMEOUT });

    const src = await iframe.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toContain('user-management');
  });

  test('/team is not accessible without authentication', async ({ browser }) => {
    const { createCleanContext } = await import('../../fixtures/clean-page');
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/team');

      await page.waitForURL(
        (url) => {
          const urlString = url.toString();
          return urlString.includes('/auth/') || urlString.includes('/login');
        },
        { timeout: LONG_TIMEOUT },
      );

      const currentUrl = page.url();
      expect(
        currentUrl.includes('/auth/') || currentUrl.includes('/login'),
      ).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
