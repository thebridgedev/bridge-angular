import { expect, test } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Create User (Sign Up) Flow', () => {
  test('sign up form creates user and shows success message', async ({
    browser,
    envConfig,
    testDataClient,
  }) => {
    const { page, cleanup } = await createCleanContext(browser);

    const signupEmail = `playwright-signup-${Date.now()}@example.com`;
    const firstName = 'Playwright';
    const lastName = 'Signup';

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const loginButton = page.locator('button:has-text("Login with Bridge")');
      await expect(loginButton).toBeVisible({ timeout: MED_TIMEOUT });
      await loginButton.click();

      await page.waitForURL(
        (url) => {
          const u = url.toString();
          return u.includes('/auth/') || u.includes('/login');
        },
        { timeout: LONG_TIMEOUT },
      );

      const loginUrl = new URL(page.url());
      const signupUrl = `${loginUrl.origin}${loginUrl.pathname.replace(/\/login.*$/, '').replace(/\/?$/, '')}/signup`;
      await page.goto(signupUrl);
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('heading', { name: /create an account/i }),
      ).toBeVisible({ timeout: LONG_TIMEOUT });

      const emailInput = page.locator('#email, input[name="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await emailInput.fill(signupEmail);

      const firstNameInput = page.locator('#firstName, input[name="firstName"]').first();
      await firstNameInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await firstNameInput.fill(firstName);

      const lastNameInput = page.locator('#lastName, input[name="lastName"]').first();
      await lastNameInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await lastNameInput.fill(lastName);

      const submitButton = page.locator('button[type="submit"]:has-text("Create account")');
      await expect(submitButton).toBeVisible({ timeout: MED_TIMEOUT });
      await submitButton.click();

      await expect(
        page.getByRole('heading', { name: /check your email/i }),
      ).toBeVisible({ timeout: LONG_TIMEOUT });

      await expect(page.getByText(/We sent an invite link to/i)).toBeVisible({
        timeout: MED_TIMEOUT,
      });
      await expect(page.getByText(signupEmail)).toBeVisible({ timeout: MED_TIMEOUT });
    } finally {
      await cleanup();

      try {
        await testDataClient.removeTestAccount(signupEmail);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[create-user] Failed to remove signup account ${signupEmail}: ${msg}`);
      }
    }
  });
});
