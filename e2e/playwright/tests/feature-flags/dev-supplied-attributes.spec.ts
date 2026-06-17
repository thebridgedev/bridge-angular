/**
 * TBP-178 — dev passes per-call attributes to flag evaluation.
 * Ported from bridge-svelte's `feature-flags/dev-supplied-attributes.spec.ts`,
 * retargeted to the Angular demo's `/flag-context-demo` route.
 *
 * Exercises the path:
 *   bridge.evaluate('enterprise-feature', false, { attributes: { plan: 'X' } })
 *     → SDK merges per-call attrs with provider attrs (dev wins on collision)
 *     → rule evaluator runs against merged context
 *     → returns matched branch's returnValue or rule.otherwiseValue
 *
 * Demo route: /flag-context-demo
 *   - Upserts the test flag locally on init (state: 'on-with-rule', rule:
 *     plan == 'enterprise' → true, otherwise false).
 *   - Three buttons call bridge.evaluate(key, default, { attributes: { plan } })
 *     for plan in {enterprise, pro, free} and render the result.
 *
 * Environment-deferred run (matches the svelte source + plugin E2E env gaps).
 */

import { expect, test } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature flags — dev-supplied per-call attributes (TBP-178)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flag-context-demo');
    await page.waitForLoadState('networkidle');

    // Wait for the SDK cache to be seeded with the test flag.
    await expect(page.getByTestId('cache-ready')).toHaveText('ready', {
      timeout: MED_TIMEOUT,
    });

    // Surface any seeding error loudly in the report.
    await expect(page.getByTestId('cache-error')).toHaveCount(0);
  });

  test('plan=enterprise → returns true (matches branch)', async ({ page }) => {
    await page.getByTestId('eval-enterprise').click();

    await expect(page.getByTestId('last-plan')).toHaveText('enterprise');
    await expect(page.getByTestId('flag-result')).toHaveText('true');
  });

  test('plan=pro → returns false (falls through to otherwiseValue)', async ({
    page,
  }) => {
    await page.getByTestId('eval-pro').click();

    await expect(page.getByTestId('last-plan')).toHaveText('pro');
    await expect(page.getByTestId('flag-result')).toHaveText('false');
  });

  test('plan=free → returns false (falls through to otherwiseValue)', async ({
    page,
  }) => {
    await page.getByTestId('eval-free').click();

    await expect(page.getByTestId('last-plan')).toHaveText('free');
    await expect(page.getByTestId('flag-result')).toHaveText('false');
  });

  test('switching plan between calls produces independent results', async ({
    page,
  }) => {
    // Same page, no reload — prove per-call attributes don't leak between calls.
    await page.getByTestId('eval-enterprise').click();
    await expect(page.getByTestId('flag-result')).toHaveText('true');

    await page.getByTestId('eval-free').click();
    await expect(page.getByTestId('flag-result')).toHaveText('false');

    await page.getByTestId('eval-enterprise').click();
    await expect(page.getByTestId('flag-result')).toHaveText('true');
  });
});
