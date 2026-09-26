import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Public Routes', () => {
  test('home page is accessible without authentication', async ({ page }) => {
    await page.goto('/');

    const heading = page.locator('h1:has-text("Welcome to Bridge Angular Demo")');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('home page displays feature overview sections', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=Feature Flags').first()).toBeVisible();
    await expect(page.locator('text=Team Management').first()).toBeVisible();
    await expect(page.locator('text=Authentication').first()).toBeVisible();
  });

  test('home page shows Login button when not authenticated', async ({ page }) => {
    await page.goto('/');

    const loginButton = page.locator('button:has-text("Login with Bridge")');
    await expect(loginButton).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('navbar displays "Bridge Demo" brand link', async ({ page }) => {
    await page.goto('/');

    const brandLink = page.locator('a.nav-brand:has-text("Bridge Demo")');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');
  });
});
