/**
 * Welcome Paywall — first-time-user end-to-end flow
 *
 * Ported from bridge-nextjs's `subscription/welcome-paywall.spec.ts` (itself a
 * near-verbatim port of bridge-svelte's). Covers the full first-time-user
 * paywall flow: the bootstrap gates the paywall redirect on
 * `getSubscriptionStatus()` (shouldSelectPlan + paymentsAutoRedirect). Proves a
 * brand-new user is:
 *
 *   1. Forced to /welcome when they try to hit any protected route
 *   2. Able to complete Stripe Checkout from the PlanSelector on /welcome
 *   3. Landed on an in-app (non-paywall) route after returning from Stripe
 *   4. NOT bounced back to /welcome on subsequent navigation to protected routes
 *
 * Requires STRIPE_TEST_PK / STRIPE_TEST_SK env vars (skipped otherwise).
 *
 * ⚠ DEMO DEPENDENCY (flagged in the report): this spec requires the react demo
 * to expose a `/welcome` paywall route and a paywall-redirect config (svelte's
 * demo wires `billing.paywallRoute: '/welcome'` + a `/welcome` route +
 * `{ match: '/welcome', public: true }` in the route guard). That is
 * bootstrap-layer demo wiring, NOT part of the Billing 2.0 component slice. Until
 * it lands in the react demo this spec will fail step 2 even with Stripe keys —
 * but it is skipped without Stripe keys, so it does not break the suite.
 *
 * Login uses the in-app SDK-auth helper (`loginViaSdkAuth`) now that bridge-angular
 * ships the sdk-auth `<bridge-login-form>` surface — matching svelte/nextjs.
 */

import { test, expect, loginViaSdkAuth } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

const STRIPE_TEST_PK = process.env.STRIPE_TEST_PK || '';
const STRIPE_TEST_SK = process.env.STRIPE_TEST_SK || '';
const hasStripeKeys = !!STRIPE_TEST_PK && !!STRIPE_TEST_SK;

/**
 * Read the current token set from the new-core storage (`bridge_tokens:<appId>`).
 *
 * Returns BOTH access and refresh tokens. The probe below needs the refresh
 * token because the SDK refreshes the access token out-of-band right after
 * login (the plan/app mutations this spec performs bump the user's
 * `tokenVersion` server-side → a `user.state_changed` push → auth-core calls
 * `POST /auth/token grant_type=refresh_token`). A raw access token captured at
 * an arbitrary moment can therefore already be `TOKEN_VERSION_STALE`; the probe
 * mirrors the SDK by refreshing on a stale 401.
 */
function readTokens(): { accessToken: string | null; refreshToken: string | null } {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('bridge_tokens')) {
      try {
        const parsed = JSON.parse(localStorage.getItem(k) as string);
        return {
          accessToken: parsed.accessToken ?? null,
          refreshToken: parsed.refreshToken ?? null,
        };
      } catch {
        return { accessToken: null, refreshToken: null };
      }
    }
  }
  return { accessToken: null, refreshToken: null };
}

/**
 * DETERMINISTIC Stripe-price readiness wait.
 *
 * Root cause of the flake: `createPlan` (POST /account/test/playwright/create-plan)
 * returns as soon as the plan row is persisted in Mongo, but the matching
 * Stripe **test-mode price** is synced to Stripe asynchronously afterwards.
 * Until that price exists, `_getActiveStripePrice` (stripe.service.ts:1005) finds
 * no match and checkout throws a 500 "Cannot find a matching Stripe price"
 * (stripe.service.ts:125). react/svelte only pass when they happen to win that
 * race; bridge-angular loses it intermittently.
 *
 * Why this signal (and not a, b): there is NO positive readiness signal exposed
 * anywhere in the existing test-data API or the plans/subscription-status
 * payloads —
 *   (a) no /playwright/* endpoint reports Stripe-price-synced state, and
 *   (b) GET /account/subscription/{status,plans} only echo the LOCAL price
 *       offers (amount/currency/recurrenceInterval) — neither surfaces a synced
 *       Stripe price id (subscription.controller.ts:52-59 / 93-100).
 *
 * The cleanest *positive* signal available without a new bridge-api helper is the
 * checkout endpoint itself: POST /account/subscription/checkout runs the exact
 * `_getActiveStripePrice` lookup the UI click will run, and returns 200 with a
 * `checkoutUrl` ONLY once the price is checkout-resolvable. We poll it until it
 * succeeds. This is a positive readiness assertion ("checkout for this plan now
 * resolves a Stripe price and yields a redirect URL"), not a blind retry of the
 * UI action — and the abandoned checkout session it creates is harmless (it
 * mutates no tenant state; the success path of startCheckout only creates a
 * Stripe session, it does not set tenant.plan). Stripe expires the session on
 * its own.
 */
async function waitForStripePriceReady(opts: {
  checkoutUrl: string;
  appId: string;
  planKey: string;
  getToken: () => string;
  refreshToken: () => Promise<boolean>;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const pollMs = opts.pollMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';

  while (Date.now() < deadline) {
    const call = () =>
      fetch(opts.checkoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.getToken()}`,
          'x-app-id': opts.appId,
        },
        body: JSON.stringify({ planKey: opts.planKey }),
      });

    let res = await call();
    // The plan/app mutations bump tokenVersion → the captured access token can
    // come back TOKEN_VERSION_STALE (401). Mirror the probe/SDK: refresh once,
    // then retry the same poll iteration.
    if (res.status === 401 && (await opts.refreshToken())) {
      res = await call();
    }

    lastStatus = res.status;
    lastBody = await res.clone().text();

    if (res.ok) {
      const json = await res.json().catch(() => ({} as any));
      // Positive readiness: checkout resolved a Stripe price AND produced a
      // redirect URL. (checkoutUrl is null only on the Stripe-not-configured
      // fallback, which can't happen here since the app has Stripe enabled.)
      if (json?.checkoutUrl) return;
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `Stripe price for plan '${opts.planKey}' never became checkout-ready within ` +
      `${timeoutMs}ms (last checkout probe: ${lastStatus} ${lastBody})`,
  );
}

test.describe('Welcome Paywall — first-time user flow', () => {
  test.skip(!hasStripeKeys, 'STRIPE_TEST_PK / STRIPE_TEST_SK env vars required');

  test('signup → protected route bounces to /welcome → pay → land in app', async ({
    page,
    testUser,
    testDataClient,
    envConfig,
  }) => {
    // Stripe Checkout round-trip alone can take 20-40s; the default 60s budget
    // leaves no room for the rest of the flow + final assertions. The
    // deterministic Stripe-price readiness gate (step 1c) can add up to 45s, plus
    // the slow checkout redirect (up to 60s), so budget generously on top.
    test.setTimeout(180_000);

    // STABLE, reusable paywall plan key (NOT `paywall-pro-${Date.now()}`).
    //
    // Determinism rationale: the old per-run timestamped key minted a brand-new
    // plan + Stripe price on every run, then immediately drove checkout against
    // it — racing bridge-api's async Stripe price-sync/archive sweep
    // (`_getActiveStripePrice` 500 "Cannot find a matching Stripe price"), and
    // leaking a fresh Stripe price each run that piled up in the shared test
    // account and made the sweep ever slower. With a stable key + create-if-absent
    // (`ensurePlan`), the plan + its Stripe price are created and synced exactly
    // ONCE; every subsequent run reuses them with NO Stripe re-sync, so by
    // checkout time the price has been active+checkout-ready for ages. The plan is
    // intentionally NOT deleted in teardown — it persists for reuse.
    const planKey = 'e2e-paywall-pro';

    try {
      // ---- Arrange: configure the app for Stripe + paywall, and ensure the paid plan
      await testDataClient.configureApp({
        paymentsAutoRedirect: true,
        stripeEnabled: true,
        stripePublicKey: STRIPE_TEST_PK,
        stripeSecretKey: STRIPE_TEST_SK,
        currency: 'USD',
      });

      // Create-if-absent: on the first ever run this creates the plan and syncs
      // its Stripe price once; on every later run it returns the existing plan
      // WITHOUT re-triggering the Stripe archive sweep (the flake source).
      await testDataClient.ensurePlan({
        key: planKey,
        name: 'Paywall Pro',
        description: 'Paid plan for welcome-paywall E2E (stable, reused across runs)',
        trial: false,
        trialDays: 0,
        prices: [{ amount: 2900, currency: 'USD', recurrenceInterval: 'month' }],
      });

      // ---- 1a. Force the "no plan selected" state by deleting the seeded TEAM
      //          plan the new tenant auto-binds to. Recreated in finally.
      await testDataClient.deletePlan('TEAM').catch(() => {});

      // ---- 1. Sign in the fresh test user via in-app SDK auth (no plan yet)
      await loginViaSdkAuth(page, testUser.email, testUser.password);

      // Tokens should be present after login
      let { accessToken, refreshToken } = await page.evaluate(readTokens);
      expect(accessToken).not.toBeNull();

      // ---- 1b. Sanity-check that the API really considers this tenant as
      //          paywall-eligible (shouldSelectPlan=true, paymentsAutoRedirect=true).
      //
      // This raw probe must behave like the SDK does for the same endpoint: the
      // plan/app mutations above bump `tokenVersion`, so the access token grabbed
      // right after login can come back `TOKEN_VERSION_STALE` (HTTP 401). The SDK
      // recovers by refreshing the token and retrying (auth-core http.ts) — so we
      // do the same here rather than asserting against a token the SDK has already
      // rotated underneath us. `probeRes.ok` is always checked (no swallowed errors).
      // Refresh the access token the SDK-mirroring way: POST {authBaseUrl}/token
      // grant_type=refresh_token, then fall back to whatever the SDK has already
      // rotated into storage. Updates the outer `accessToken` and returns true on
      // success. Shared by the probe below and the Stripe-price readiness wait.
      const refreshAccessToken = async (): Promise<boolean> => {
        if (refreshToken) {
          const refreshRes = await fetch(`${envConfig.authBaseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: envConfig.appId,
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
            }),
          });
          if (refreshRes.ok) {
            const refreshed = await refreshRes.json();
            accessToken = refreshed.access_token;
            return true;
          }
        }
        // Fall back to whatever the SDK has already rotated into storage.
        const latest = await page.evaluate(readTokens);
        if (latest.accessToken && latest.accessToken !== accessToken) {
          accessToken = latest.accessToken;
          if (latest.refreshToken) refreshToken = latest.refreshToken;
          return true;
        }
        return false;
      };

      const probeUrl = `${envConfig.testDataApiUrl}/account/subscription/status`;
      const callProbe = (token: string) =>
        fetch(probeUrl, {
          headers: { Authorization: `Bearer ${token}`, 'x-app-id': envConfig.appId },
        });

      let probeRes = await callProbe(accessToken!);

      if (probeRes.status === 401 && (await refreshAccessToken())) {
        probeRes = await callProbe(accessToken!);
      }

      expect(
        probeRes.ok,
        `probe ${probeRes.status}: ${await probeRes.clone().text()}`,
      ).toBe(true);
      const probeBody = await probeRes.json();
      expect(probeBody.shouldSelectPlan).toBe(true);
      expect(probeBody.paymentsAutoRedirect).toBe(true);

      // ---- 1c. DETERMINISTIC readiness gate: createPlan returns before the
      //          plan's Stripe test-mode price has synced, so clicking the paid
      //          plan can race `_getActiveStripePrice` → 500 before checkout can
      //          redirect. Poll the checkout endpoint (same price lookup the UI
      //          click performs) until it resolves a Stripe price and returns a
      //          checkoutUrl. See waitForStripePriceReady's doc comment for why
      //          this is the only positive readiness signal available.
      await waitForStripePriceReady({
        checkoutUrl: `${envConfig.testDataApiUrl}/account/subscription/checkout`,
        appId: envConfig.appId,
        planKey,
        getToken: () => accessToken!,
        refreshToken: refreshAccessToken,
        // Safety net only. With the STABLE `e2e-paywall-pro` plan, its Stripe price
        // is synced once and reused — so this gate normally resolves on the first
        // poll because the price has been checkout-ready for ages. It still guards
        // the one-time first-run case (the very first run that actually creates the
        // plan) and any transient propagation delay, surfacing readiness
        // deterministically instead of racing into a UI 500.
        timeoutMs: 45_000,
        pollMs: 2_000,
      });

      // ---- 2. Navigate to a protected route → expect paywall redirect to /welcome.
      await page.goto('/protected', { waitUntil: 'commit' });
      await page.waitForURL('**/welcome', { timeout: LONG_TIMEOUT });
      expect(new URL(page.url()).pathname).toBe('/welcome');

      // ---- 3. PlanSelector renders on /welcome and finishes loading
      const planSelector = page.locator('[data-bridge-plan-selector]');
      await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(planSelector).not.toHaveAttribute('data-loading', 'true', {
        timeout: LONG_TIMEOUT,
      });

      // ---- 4. Click "Select" on the paid plan card → redirect to Stripe Checkout
      const paidPlanCard = page
        .locator('[data-bridge-plan-card]')
        .filter({ hasText: 'Paywall Pro' });
      await expect(paidPlanCard).toBeVisible({ timeout: MED_TIMEOUT });
      const paidPlanBtn = paidPlanCard.locator('button').first();
      await expect(paidPlanBtn).toBeVisible({ timeout: MED_TIMEOUT });
      await paidPlanBtn.click();

      // The click triggers POST /account/subscription/checkout, which re-runs the
      // same (slow, paginated) `_getActiveStripePrice` lookup + Stripe session
      // creation before redirecting. On the slow shared test account 30s
      // (LONG_TIMEOUT) is too tight for that round-trip → give it 60s.
      await page.waitForURL((url) => url.hostname.includes('stripe.com'), {
        timeout: 60_000,
      });
      expect(page.url()).toContain('stripe.com');

      // ---- 5. Fill Stripe test card
      const cardInput = page
        .locator('#cardNumber, [data-testid="card-number-input"], input[name="cardNumber"]')
        .first();
      await cardInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await cardInput.fill('4242424242424242');

      const expiryInput = page
        .locator('#cardExpiry, [data-testid="card-expiry-input"], input[name="cardExpiry"]')
        .first();
      await expiryInput.fill('1234'); // 12/34

      const cvcInput = page
        .locator('#cardCvc, [data-testid="card-cvc-input"], input[name="cardCvc"]')
        .first();
      await cvcInput.fill('123');

      const nameInput = page.locator('#billingName, input[name="billingName"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Playwright Test');
      }

      const zipInput = page
        .locator('#billingPostalCode, input[name="billingPostalCode"]')
        .first();
      if (await zipInput.isVisible().catch(() => false)) {
        await zipInput.fill('12345');
      }

      const submitButton = page.locator('button[type="submit"], .SubmitButton').first();
      await submitButton.click();

      // ---- 6. Stripe processes payment and redirects back to the demo's callback,
      //         which bootstrap recognises and resolves by confirming the checkout,
      //         refreshing tokens, and redirecting to the success redirect.
      await page.waitForURL(
        (url) => !url.hostname.includes('stripe.com'),
        { timeout: 60_000 } // Stripe processing can take a while
      );
      // Wait for the post-checkout subscription UI to finish rendering its
      // active-billing state. PlanSelector surfaces active billing via
      // data-state="active".
      await expect(page.locator('[data-bridge-plan-selector][data-state="active"]')).toBeVisible({
        timeout: LONG_TIMEOUT,
      });

      const postCheckoutUrl = page.url();
      const postCheckoutPath = new URL(postCheckoutUrl).pathname;

      // ---- 7. We must NOT have been bounced back to /welcome.
      expect(postCheckoutPath).not.toBe('/welcome');
      expect(postCheckoutUrl).not.toContain('stripe.com');

      // ---- 8. Bonus: navigating to a fresh protected route should now succeed.
      await page.goto('/protected');
      const finalPath = new URL(page.url()).pathname;
      expect(finalPath).not.toBe('/welcome');
      expect(finalPath).toBe('/protected');
    } finally {
      // ---- Cleanup: restore the TEAM trial plan that other tests rely on and
      //               disable Stripe.
      //
      // We do NOT delete the stable `e2e-paywall-pro` plan: it is meant to persist
      // and be reused across runs so its Stripe price stays synced+active. Deleting
      // it would re-run the Stripe archive sweep AND force the next run to recreate
      // (and re-race) the price — exactly the flake this change removes.
      await testDataClient
        .createPlan({
          key: 'TEAM',
          name: 'Team',
          trial: true,
          trialDays: 14,
          prices: [{ amount: 99, currency: 'EUR', recurrenceInterval: 'month' }],
        })
        .catch(() => {});
      await testDataClient
        .configureApp({ paymentsAutoRedirect: false, stripeEnabled: false })
        .catch(() => {});
    }
  });
});
