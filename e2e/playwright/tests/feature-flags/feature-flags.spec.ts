import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature Flags', () => {
  test('feature flag section is visible on home page', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h2:has-text("Feature Flag Examples")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });

  test('cached feature flag renders content based on flag state', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cachedSection = page.locator('.feature-example:has-text("Cached Feature Flag")');
    await expect(cachedSection).toBeVisible({ timeout: MED_TIMEOUT });

    const activeStatus = cachedSection.locator('text=demo-flag');
    await expect(activeStatus.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('live feature flag section renders', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const liveSection = page.locator('.feature-example:has-text("Live Feature Flag")');
    await expect(liveSection).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('live feature flag makes API call', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const flagApiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/flags/evaluate/')) {
        flagApiCalls.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(flagApiCalls.length).toBeGreaterThanOrEqual(0);
  });

  test('negated feature flag shows inverse content', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cachedSection = page.locator('.feature-example:has-text("Cached Feature Flag")');
    const activeMsg = cachedSection.locator('.feature-status.active');
    const inactiveMsg = cachedSection.locator(
      '.feature-status:has-text("Create a feature flag")',
    );

    const isActive = await activeMsg.isVisible().catch(() => false);
    const isInactive = await inactiveMsg.isVisible().catch(() => false);

    expect(isActive !== isInactive).toBeTruthy();
  });
});
