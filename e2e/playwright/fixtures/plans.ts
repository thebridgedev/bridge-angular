/**
 * Plans the suite provisions ahead of time, once per worker app, in
 * `global-setup.ts` (TBP-721). Shared from here so the specs and the setup
 * cannot drift apart.
 */

/**
 * The trial plan bridge-api's `createPlaywrightTestAccount` binds every new
 * test tenant to. Account creation fails with 404 "has no plan with key: TEAM"
 * on an app without it, which takes down every spec that uses `testUser`.
 *
 * `setup-test-app` seeds it, but only once, and nothing restores it if a run
 * deletes it — the old welcome-paywall spec did exactly that, app-wide. So
 * global-setup ensures it (create-if-absent) on every worker app, every run.
 * The definition matches the one `setup-test-app` seeds.
 */
export const TEAM_PLAN = {
  key: 'TEAM',
  name: 'Team',
  trial: true,
  trialDays: 14,
  prices: [{ amount: 99, currency: 'EUR', recurrenceInterval: 'month' }],
};

/**
 * `welcome-paywall.spec.ts` drives a real Stripe Checkout, so its plan's Stripe
 * price has to be synced and active *before* the test clicks "Select". A plan
 * created inside the test races bridge-api's async price-sync/archive sweep
 * (`_getActiveStripePrice` → 500 "Cannot find a matching Stripe price").
 *
 * The key is therefore STABLE and the plan is created via `ensure-plan`
 * (create-if-absent) in `global-setup.ts`, once per worker app, and never
 * deleted — so on every run after the first it is simply reused, with no Stripe
 * work at all.
 */
export const PAYWALL_PLAN = {
  key: 'e2e-paywall-pro',
  currency: 'USD',
  definition: {
    key: 'e2e-paywall-pro',
    name: 'Paywall Pro',
    description: 'Paid plan for welcome-paywall E2E (stable, reused across runs)',
    trial: false,
    trialDays: 0,
    prices: [{ amount: 2900, currency: 'USD', recurrenceInterval: 'month' }],
  },
};
