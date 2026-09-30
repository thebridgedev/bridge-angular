/**
 * Create User (Sign Up) Flow
 *
 * A new account made through the app's own sign-up page, `/auth/signup`, which
 * `bridgeAuthRoutes()` serves: email, first and last name → "Sign up" → the
 * "Check your email" confirmation naming the address. The account is removed
 * through the test-data API afterwards.
 *
 * TBP-744: this used to click "Login with Bridge", follow the redirect to the
 * hosted portal and rewrite that address to the portal's signup page, expecting
 * `#email` and a "Create account" button. The demo signs people up in the app
 * now (the ten-line integration), and the hosted page no longer has that shape,
 * so the stage run of 0.8.0-beta.1 timed out. Same shape as bridge-svelte's spec.
 */
import { expect, test } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Create User (Sign Up) Flow', () => {
  test('sign up form creates user and shows success message', async ({ page, testDataClient }) => {
    const signupEmail = `iman+playwright-test-signup-${Date.now()}@nebulr.group`;

    try {
      await page.goto('/auth/signup');

      await page.locator('#signup-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await page.locator('#signup-email').fill(signupEmail);
      await page.locator('#signup-first-name').fill('Playwright');
      await page.locator('#signup-last-name').fill('Signup');

      const submit = page.getByRole('button', { name: 'Sign up', exact: true });
      await expect(submit).toBeEnabled({ timeout: MED_TIMEOUT });
      await submit.click();

      await expect(page.getByText('Check your email')).toBeVisible({ timeout: LONG_TIMEOUT });
      await expect(page.getByText(signupEmail)).toBeVisible({ timeout: MED_TIMEOUT });
    } finally {
      try {
        await testDataClient.removeTestAccount(signupEmail);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[create-user] Failed to remove signup account ${signupEmail}: ${msg}`);
      }
    }
  });

  test('signup page has login link', async ({ page }) => {
    await page.goto('/auth/signup');

    const loginLink = page.locator('a[href="/auth/login"]').first();
    await expect(loginLink).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
