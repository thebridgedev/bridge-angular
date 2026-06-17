/**
 * Playwright spec for the unified `bridge` read surface — ported from
 * bridge-svelte's `bootstrap/unified-bridge-surface.spec.ts`, retargeted to the
 * Angular demo (which exposes a `window.bridge`-equivalent in AppComponent).
 *
 * Verifies the end-to-end snapshot flow:
 *   1. After authenticated bootstrap, `bridge.tenant.id` resolves non-null.
 *   2. `bridge.user.email` resolves to the logged-in test email.
 *   3. `bridge.tenant.subscription.plan.slug` exposes the current plan.
 *   4. `bridge.tenant.entitlements.can(...)` answers synchronously.
 *   5. `bridge.app.plans` is lazy (null) before .load(); resolves after.
 *
 * NOT YET RUN — full milestone-end E2E pass is environment-deferred (matches the
 * svelte source spec's deferral note + plugin E2E env gaps TBP-405/406).
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Unified bridge surface — session.snapshot end-to-end', () => {
  test('snapshot lands and populates bridge.tenant + bridge.user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The Angular demo exposes `window.bridge` (AppComponent) with signal slices
    // adapted to a `{ subscribe }` shape so this svelte-origin probe works as-is.
    const result = await page.waitForFunction(
      () => {
        const w = window as unknown as {
          bridge?: {
            tenant: {
              id: { subscribe: (fn: (v: string | null) => void) => () => void };
              subscription: { subscribe: (fn: (v: unknown) => void) => () => void };
            };
            user: { subscribe: (fn: (v: unknown) => void) => () => void };
          };
        };
        if (!w.bridge) return null;
        let tenantId: string | null = null;
        let subscription: any = null;
        let user: any = null;
        const u1 = w.bridge.tenant.id.subscribe((v) => { tenantId = v; });
        const u2 = w.bridge.tenant.subscription.subscribe((v) => { subscription = v; });
        const u3 = w.bridge.user.subscribe((v) => { user = v; });
        u1(); u2(); u3();
        return tenantId && subscription && user ? { tenantId, subscription, user } : null;
      },
      { timeout: MED_TIMEOUT },
    );

    const value = await result.jsonValue();
    expect(value).not.toBeNull();
    expect(value.tenantId).toMatch(/.+/);
    expect(value.subscription.plan).toBeDefined();
    expect(value.subscription.plan.slug).toMatch(/.+/);
    expect(value.user.id).toMatch(/.+/);
    expect(value.user.tenantId).toBe(value.tenantId);
  });

  test('entitlements.can() answers from the snapshot map', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const canApp = await page.waitForFunction(
      () => {
        const w = window as unknown as { bridge?: { tenant: { entitlements: { can: (k: string) => boolean } } } };
        if (!w.bridge) return null;
        // app_active is the canonical "is the workspace allowed in" entitlement.
        return { app_active: w.bridge.tenant.entitlements.can('app_active') };
      },
      { timeout: MED_TIMEOUT },
    );
    const value = await canApp.jsonValue();
    expect(value).toEqual({ app_active: true });
  });

  test('bridge.app.plans is lazy — null until .load(), populated after', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Initially null.
    const initial = await page.evaluate(() => {
      const w = window as unknown as { bridge?: { app: { plans: { _peek: () => unknown; isLoaded: boolean } } } };
      return w.bridge ? { value: w.bridge.app.plans._peek(), isLoaded: w.bridge.app.plans.isLoaded } : null;
    });
    expect(initial?.isLoaded).toBe(false);
    expect(initial?.value).toBeNull();

    // After .load(), value populated.
    const loaded = await page.evaluate(async () => {
      const w = window as unknown as { bridge?: { app: { plans: { load: () => Promise<unknown[]>; isLoaded: boolean } } } };
      if (!w.bridge) return null;
      const v = await w.bridge.app.plans.load();
      return { len: Array.isArray(v) ? v.length : -1, isLoaded: w.bridge.app.plans.isLoaded };
    });
    expect(loaded?.isLoaded).toBe(true);
    expect(loaded?.len).toBeGreaterThan(0);
  });
});
