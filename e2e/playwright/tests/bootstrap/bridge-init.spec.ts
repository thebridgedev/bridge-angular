import { test, expect } from '../../fixtures/auth';
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

    // What this test waits for is "the app finished booting", which the rendered
    // heading states. It cannot wait for the network to go idle: the demo holds a
    // live realtime WebSocket, so idle never arrives.
    await expect(page.locator('h1')).toBeVisible({ timeout: MED_TIMEOUT });

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

    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('ConfigStatus component displays configuration state', async ({ page }) => {
    await page.goto('/');

    const configStatus = page.locator('text=Bridge');
    await expect(configStatus.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
