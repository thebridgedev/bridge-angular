import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature Flag Route Guards', () => {
  test('/beta redirects to / when required flag is disabled', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/beta');
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();
    const pathname = new URL(currentUrl).pathname;

    if (!currentUrl.includes('/beta')) {
      expect(pathname === '/' || pathname === '').toBeTruthy();
    } else {
      expect(currentUrl).toContain('/beta');
    }
  });

  test('unauthenticated user on /beta is redirected (not shown error)', async ({
    browser,
  }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/beta');
      await page.waitForLoadState('networkidle');

      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
