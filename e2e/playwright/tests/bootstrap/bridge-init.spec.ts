import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Bridge Initialization', () => {
  test('demo app loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') &&
        !err.includes('404') &&
        !err.includes('Failed to load resource'),
    );

    expect(criticalErrors).toEqual([]);
  });

  test('BridgeBootstrap initializes and renders the heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('ConfigStatus component displays configuration state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const configStatus = page.locator('text=Bridge');
    await expect(configStatus.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
