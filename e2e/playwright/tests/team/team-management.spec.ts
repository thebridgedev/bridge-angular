/**
 * Team management — team page loads for authenticated user.
 *
 * The legacy iframe/handover page has been hard-replaced (§2.6) by the in-app
 * `<bridge-team-panel>`, so the old iframe-src assertions are gone. This spec
 * mirrors react's `team/team-management.spec.ts`.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Team management', () => {
  test('authenticated user can open team page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL((url) => url.pathname.includes('team'));
    await expect(page.locator('[data-bridge-team-panel]')).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
