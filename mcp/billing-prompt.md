# Bridge Angular — Billing

You are wiring **billing UI** into an Angular (standalone-components, v19+) application that uses The Bridge. Plans and Stripe are already configured — this guide covers the frontend only: the subscription page, lifecycle notices, quota counters, and the paywall.

> **STOP — do not install any packages.** The only dependency is `@nebulr-group/bridge-angular`, which is already installed. Do NOT install `@stripe/stripe-js` — the SDK redirects to Stripe Checkout via a plain URL redirect, no Stripe client library needed.

> **No `/billing` subpath.** Like the flag API, the whole billing surface is on the **main entry** — import every component and signal helper from `@nebulr-group/bridge-angular` (only `./styles.css` is a separate export).

## Prerequisites

Verify before starting:

```bash
bridge plan list
```

- At least one plan must be listed. If empty, run `bridge guide billing` (no `--framework`) first — the master prompt handles plan creation and Stripe setup, then comes back here.

```bash
bridge stripe status
```

- If any plan has a price, Stripe must be connected. If it isn't, `<bridge-plan-selector>` will silently fail when a user picks a paid plan. Return to the master prompt (`bridge guide billing`) to connect Stripe before continuing. Free-only setups can skip this check.

- Bridge must be set up in this project:
  - `@nebulr-group/bridge-angular` in `package.json`
  - `provideBridge(...)` registered in `appConfig.providers` (see the auth/flags guides)
  - `appId` set (read from `environment.ts`)

## Step 1 — Subscription page

Create `src/app/pages/subscription/subscription.component.ts`:

```ts
import { Component } from '@angular/core';
import { PlanSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <h1>Choose a plan</h1>
    <bridge-plan-selector />
  `,
})
export class SubscriptionComponent {}
```

`<bridge-plan-selector>` handles everything: loads plans, shows the current plan, routes free-plan selection directly (`selectFreePlan`), and launches Stripe Checkout for paid plans (`startCheckout` → redirect to the returned `checkoutUrl`). After payment or cancellation, Stripe returns through Bridge's unified `/auth/oauth-callback` handler, which syncs billing state and lands the user on your `successRedirect` / `cancelRedirect`. No redirect pages or URL configuration needed.

**`<bridge-plan-selector>` inputs / outputs:**

| Binding | Type | Default | Description |
|---------|------|---------|-------------|
| `successRedirect` | `string` (input) | `/subscription` | Where to send the user after a successful payment |
| `cancelRedirect` | `string` (input) | `/subscription` | Where to send the user after a cancelled payment |
| `className` / `style` | `string` (input) | `''` | Pass-through styling |
| `(select)` | `EventEmitter<{ plan, price }>` (output) | — | Fires after free-plan selection or a plan change |

**Paywall (post-signup):** to drop the user straight into the app after first payment, set `successRedirect="/"`. The subscription syncs automatically on whichever page they land on.

## Step 2 — Billing notice banner

Add `<bridge-billing-notice />` to your root component. It renders nothing when billing is healthy and automatically shows the right message for payment failures, trial endings, cancellations, and dunning:

```ts
import { BillingNoticeComponent } from '@nebulr-group/bridge-angular';
// @Component({ imports: [BillingNoticeComponent], template: `<bridge-billing-notice />` })
```

It reads `useBridge().subscription` (the Billing 2.0 lifecycle snapshot from auth-core, via `createSubscriptionSignal()`) and renders for `past_due`, `trial_active`, `trial_ending_soon`, `cancel_at_period_end`, `canceled`, and the `dunning_*` states. Admins get a CTA; members get an informational banner. Inputs:

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `chassis` | `'bar' \| 'rail' \| 'card'` | `'rail'` | Visual shell |
| `mode` | `'soft' \| 'hard'` | `'soft'` | `hard` renders a full lockscreen for the locked state |
| `onActionClick` | `(state) => void` | — | Override the default CTA (which navigates to `/billing`) |

## Step 2b — Plan-selection paywall (default)

Set this up by default: a signed-in tenant with no plan can't use the app until they pick one. There are two ways — pick one.

**Option A — `<bridge-paywall>` overlay.** Wrap your routed content:

```ts
import { PaywallComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [PaywallComponent, RouterOutlet],
  template: `
    <bridge-paywall successRedirect="/">
      <router-outlet />
    </bridge-paywall>
  `,
})
export class ShellComponent {}
```

`<bridge-paywall>` shows a fullscreen plan-selector modal when the session reports `shouldSelectPlan` (and `paymentsAutoRedirect` is not `false`), then projects `<ng-content>` once a plan is chosen. Inputs: `successRedirect` (default `/`), `cancelRedirect` (default `/`), `heading` (optional). Output: `(select)`.

**Option B — paywall route via `provideBridge()`.** Configure `billing.paywallRoute` so the auth guard redirects planless users before they reach a protected route:

```ts
// src/app/app.config.ts
const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  billing: { paywallRoute: '/welcome', paymentErrorRoute: '/payment-error' },
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(bridgeConfig)],
};
```

Then render a `<bridge-plan-selector />` on the `/welcome` route. The redirect is gated by the app-level `paymentsAutoRedirect` flag (**`true` by default**). To turn the whole paywall off:

```bash
bridge app update --payments-auto-redirect false
```

## Step 3 — Quota and entitlement UI (optional)

Skip if the plans have no per-resource limits or feature differences.

> Quotas and entitlements were configured in the master prompt (or the Bridge admin → **Plans**) via `bridge plan quota set` and `bridge plan entitlement set`. This step only surfaces them.

To show a live quota counter, drop in `<bridge-quota-banner metric="ai_completions" />` — it renders nothing below 80% of the cap, then a warning at 80–94% and a critical notice at ≥95%. It reads `useBridge().quota(metric)` (via `createQuotaSignal(metric)`) and ticks live as usage is reported, no polling. Inputs: `metric` (required), `label`, `onActionClick`.

To gate a feature by entitlement, call `useBridge().entitlements.can('key')`:

```ts
import { Component, computed } from '@angular/core';
import { useBridge } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-analytics-link',
  standalone: true,
  template: `@if (canAnalytics) { <a href="/analytics">Open advanced analytics</a> }`,
})
export class AnalyticsLinkComponent {
  readonly canAnalytics = useBridge().entitlements.can('advanced_analytics');
}
```

`can()` returns `false` until hydrated (fail-closed) and flips when the plan changes or a `hard` quota exhausts. For a value that re-renders the template on every change, drive it through a `createQuotaSignal`/`createSubscriptionSignal`-style signal rather than reading `can()` once.

## Step 4 — Reporting usage

To make quota counters tick, report usage from your code. Fire-and-forget; the SDK queues durably:

```ts
import { getBridgeAuth } from '@nebulr-group/bridge-angular';

getBridgeAuth().usage.report('ai_completions', 1); // value defaults to 1
```

Reporting to a metric not configured in the admin is accepted server-side but ticks no counter. Exceeding the cap always succeeds — the reaction is downstream (`metered` bills overage, `hard` flips the entitlement off).

## Reading subscription state

Two reactive reads, depending on the call site:

- `<bridge-subscription-status />` — the ready-made display component (current plan name + status badge). Input: `className`.
- The **billing signals** for code/template branching:

```ts
import { Component, OnDestroy } from '@angular/core';
import { createSubscriptionSignal, createQuotaSignal } from '@nebulr-group/bridge-angular';

@Component({ /* ... */ })
export class BillingWidget implements OnDestroy {
  private sub = createSubscriptionSignal();   // BillingSignal<BillingSubscriptionSnapshot>
  private quota = createQuotaSignal('ai_completions'); // BillingSignal<QuotaSnapshot | undefined>

  readonly status = this.sub.value;   // Signal<...> — read .value in templates
  readonly usage = this.quota.value;

  ngOnDestroy() {
    this.sub.destroy();    // tear down the store subscription
    this.quota.destroy();
  }
}
```

`createSubscriptionSignal()` and `createQuotaSignal(metric)` return a `BillingSignal<T>` — `{ value: Signal<T>; destroy(): void }`. **Always call `.destroy()` in `ngOnDestroy`** to release the underlying store subscription. Both update reactively — no polling.

## What to expect in the dashboard

Plans, prices, quotas, and entitlements are configured at **app.thebridge.dev** (Plans) — never in code. Paid plans require a connected Stripe account; Checkout and the customer portal are Stripe-hosted. Lifecycle changes (payment failed, trial ending, cancellation) flow back over the realtime channel and update the notice/quota UI live.

## Standalone vs full-platform

- **Full platform:** billing rides the same `provideBridge()` as auth and flags — the signed-in tenant's plan drives entitlements and quotas automatically.
- Billing UI assumes the user is authenticated (a tenant must exist to have a subscription). Set up **auth** first — see the auth guide. For feature gating, remember entitlements describe what the user *bought*; **feature flags** (see the flags guide) describe what's *exposed*.

## Billing checklist

Before verifying, confirm every item was applied:

- [ ] `bridge plan list` returns at least one plan
- [ ] Subscription component created with `<bridge-plan-selector />` (no inputs needed for the standard plan-change flow)
- [ ] `<bridge-billing-notice />` added to the root component
- [ ] Paywall: `<bridge-paywall>` wrapping the routed content, OR `billing.paywallRoute` set in `provideBridge()`
- [ ] Quota/entitlement UI added if plans have limits
- [ ] Every `createSubscriptionSignal`/`createQuotaSignal` is torn down in `ngOnDestroy`
- [ ] No extra packages installed (`@stripe/stripe-js` must NOT be in package.json)

## Verify

1. Navigate to the subscription page — plan cards render with correct prices; a tier with monthly + yearly pricing shows both intervals.
2. Select a free plan — subscription updates immediately, no redirect.
3. Select a paid plan — Stripe Checkout launches.
4. Complete payment — redirected back with the updated plan showing.
5. Cancel payment — redirected to the cancel target.
6. Paywall: sign in as a new tenant with no plan — the paywall blocks the app until a plan is chosen.
7. Run the project's build command — no TypeScript or import errors.

---

> **If you are running this guide as part of `bridge guide billing` (the master prompt):** this guide is now complete. Return to the master and continue with the remaining steps (paywall, verification, success banner, follow-on tracks). Do not stop here.
