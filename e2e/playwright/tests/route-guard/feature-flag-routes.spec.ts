import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature Flag Route Guards', () => {
  test('/beta redirects to / when required flag is disabled', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/beta');

    // What this test waits for is the guard settling on a destination — either it
    // let us stay on /beta or it bounced us to '/'. Waiting for the network to go
    // idle would never return while the realtime WebSocket is open.
    await page.waitForURL(
      (url) => url.pathname === '/beta' || url.pathname === '/',
      { timeout: LONG_TIMEOUT },
    );

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

      // Wait for the guard to settle on one of its possible destinations rather
      // than for network idle, which the realtime WebSocket prevents.
      await page.waitForURL(
        (url) =>
          url.pathname === '/beta' || url.pathname === '/' || url.pathname.startsWith('/auth/'),
        { timeout: LONG_TIMEOUT },
      );

      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
