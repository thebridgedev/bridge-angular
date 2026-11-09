# Bridge Angular — Billing

You are wiring **billing UI** into an Angular (standalone-components, v19+) application that uses The Bridge. Plans and Stripe are already configured — this guide covers the frontend only: the subscription pages, lifecycle notices, quota counters, the paywall, and the billing portal.

> **STOP — do not install any packages.** The only dependency is `@nebulr-group/bridge-angular`, which is already installed. Do NOT install `@stripe/stripe-js` — the SDK redirects to Stripe Checkout via a plain URL redirect, no Stripe client library needed.

> **No `/billing` subpath.** Like the flag API, the whole billing surface is on the **main entry** — import every component and signal helper from `@nebulr-group/bridge-angular` (only `./styles.css` is a separate export).

## Decide first — which billing surface do you need?

Billing is not one component. Pick the rows that match what the app has to do; most apps need the first three. Every component is standalone and imports from the main entry.

| You need | Use | What it does |
|---|---|---|
| **The subscription page, the paywall and the checkout return pages** | `...bridgeBillingRoutes()` in `app.routes.ts` (Step 1) | Serves `/subscription` (current plan, "Manage billing", plan picker), `/subscription/plan` (paywall), `/subscription/success`, `/subscription/error` |
| **The app unusable until the workspace has a plan** | Nothing more | With plans, `bridgeAuthGuard()` redirects a plan-less workspace to `/subscription/plan` |
| Let users update their card, see invoices or cancel | `<bridge-billing-portal-button>` | Already on `/subscription`; place it anywhere else you want it (Step 5) |
| Let a tenant pick or change a plan on a page of your own | `<bridge-plan-selector>` | Loads plans, applies a free plan directly, launches Stripe Checkout for paid ones |
| Tell the user about a failed payment, ending trial or cancellation | `<bridge-billing-notice>` | Renders nothing while billing is healthy |
| Show the current plan and status | `<bridge-subscription-status>` | Display only |
| Warn as a metered limit fills up | `<bridge-quota-banner metric="…">` | Silent below 80% of the cap |
| Branch your **code** on plan, status or usage | `createSubscriptionSignal()` / `createQuotaSignal(metric)`, or `bridge.tenant.subscription` | Signals — the `create*` pair must be `.destroy()`-ed in `ngOnDestroy` |
| Gate a feature on what the plan **bought** | `bridge.tenant.entitlements.can(key)` / `.snapshot()` | Fail-closed until the snapshot loads |

**Reach for these before writing plan cards or calling Stripe yourself.** `<bridge-plan-selector>` already covers the free/paid split, the current-plan state, the Checkout redirect and the return through Bridge's `/auth/oauth-callback`; a hand-rolled version has to keep all four correct as plans change, and a wrong Checkout call takes real money.

**Entitlements are not feature flags.** An entitlement says what the tenant *bought* (this guide); a flag says what is *exposed* (`feature-flags-prompt.md`). Gating a paid capability on a flag leaves it switchable for people who never paid.

> **Never hardcode a billing-portal or Stripe URL.** `<bridge-billing-portal-button>` (and `getBridgeAuth().getBillingPortalUrl()` under it) mints a portal session for the signed-in workspace at click time; a pasted URL either expires or opens whichever workspace it was minted for.

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

## Step 1 — Mount the subscription pages

**Do not write a subscription page, a success or cancel page, a `/billing` page or a `/payment-error` page.** One spread serves them all. Put it inside the guarded parent, next to your own routes (the auth guide already added `...bridgeAuthRoutes()`; the Stripe return comes back through its `/auth/oauth-callback`):

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes, bridgeBillingRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      ...bridgeBillingRoutes(),   // /subscription, /subscription/plan, /subscription/success, /subscription/error
      // …your routes
    ],
  },
];
```

That one spread is the whole subscription surface:

| Address | Page | Config default it serves |
|---|---|---|
| `/subscription` | Current plan, "Manage billing" (`<bridge-billing-portal-button>`), plan picker | `billing.manageRoute` |
| `/subscription/plan` | The paywall | `billing.paywallRoute` |
| `/subscription/success` | Where a checkout or a free pick lands | `<manageRoute>/success` |
| `/subscription/error` | Where a failed checkout confirmation lands | `billing.paymentErrorRoute` |

The plan picker loads plans cheapest first, shows interval tabs and each plan's features, selects a free plan directly, confirms before an instant switch, and launches Stripe Checkout for a paid plan. Stripe returns through Bridge's `/auth/oauth-callback`, which confirms the checkout and lands on `/subscription/success`.

To customise, cheapest first: the `--bridge-*` CSS tokens; then `bridgeBillingRoutes({ frame, heading })` (`frame` is a layout component with a `<router-outlet>`, `heading(page)` returns each page's heading); then take one page over and keep the others, `bridgeBillingRoutes({ overrides: { plan: { component: MyPricing } } })`, building it from `<bridge-plan-selector>`. `path: 'billing'` moves the whole set; set `billing.manageRoute` / `paywallRoute` / `paymentErrorRoute` in `provideBridge()` to match.

**`<bridge-plan-selector>` inputs / outputs** (for a page of your own; the pages above already use it):

| Binding | Type | Default | Description |
|---------|------|---------|-------------|
| `successRedirect` | `string` (input) | `/subscription` | Where to send the user after a successful payment |
| `cancelRedirect` | `string` (input) | `/subscription` | Where to send the user after a cancelled payment |
| `className` / `style` | `string` (input) | `''` | Pass-through styling |
| `(select)` | `EventEmitter<{ plan, price }>` (output) | — | Fires after free-plan selection or a plan change |

On a page of your own, set `successRedirect="/"` to drop the user straight into the app after the first payment. The subscription syncs automatically on whichever page they land on.

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
| `onActionClick` | `(state) => void` | — | Override the default CTA click handler |
| `actionHref` | `string` | — | CTA destination for this instance. Overrides `billing.manageRoute` config; `onActionClick` takes precedence over both |

The default CTA navigates to `billing.manageRoute` from the Bridge config, default `/subscription` — the page `...bridgeBillingRoutes()` serves.

## Step 2b — Plan-selection paywall (on by default)

Nothing to write. When the app has plans, `bridgeAuthGuard()` sends a signed-in workspace with no plan to `/subscription/plan` (served by Step 1) before it reaches a guarded route, and lets it through once a plan is active. The redirect respects the app-level `paymentsAutoRedirect` flag (**`true` by default**):

```bash
bridge app update --payments-auto-redirect false   # turn the paywall off for the app
```

Variations, only when the developer asks for them:

- **An onboarding page of your own** (e.g. `/welcome`): a product decision — ask, never create it unasked. If yes, render `<bridge-paywall-page heading="…" />` on that route and set `billing: { paywallRoute: '/welcome' }` in the `provideBridge()` config.
- **A modal instead of a redirect:** wrap the routed content in `<bridge-paywall>` (it shows a full-screen plan picker while the session reports `shouldSelectPlan`, then projects its content) and set `billing: { paywallRoute: false }`, so the guard does not redirect as well. Inputs: `successRedirect` (default `/`), `cancelRedirect` (default `/`), `heading`. Output: `(select)`.

```ts
// src/app/app.config.ts — only for one of the variations above
const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  // Defaults to production. Required for a stage / local / self-hosted app.
  apiBaseUrl: environment.bridgeApiBaseUrl || undefined,
  billing: {
    paywallRoute: '/welcome',               // or false with <bridge-paywall>; default '/subscription/plan'
    // Where the Upgrade/Manage buttons in <bridge-billing-notice> and
    // <bridge-quota-banner> go. Defaults to '/subscription'.
    manageRoute: '/subscription',
  },
};
```

## Step 3 — Quota and entitlement UI (optional)

Skip if the plans have no per-resource limits or feature differences.

> Quotas and plan features were configured in the master prompt (or the Bridge admin → **Plans**) via `bridge plan quota set` and `bridge plan feature add`. This step only surfaces them. (There is no `bridge plan entitlement set` command: a plan feature is added with `bridge plan feature add`, and every `hard` quota is also an entitlement of the same name.)

To show a live quota counter, drop in `<bridge-quota-banner metric="ai_completions" />` — it renders nothing below 80% of the cap, then a warning at 80–94% and a critical notice at ≥95%. It reads `useBridge().quota(metric)` (via `createQuotaSignal(metric)`) and ticks live as usage is reported, no polling. Inputs: `metric` (required), `label`, `onActionClick`, `actionHref` (Upgrade CTA destination; defaults to `billing.manageRoute` config → `/subscription`).

**Plan limits, lowest level first.** Level 0 needs no page code: with `bridgeInterceptor` provided, a `402 QUOTA_EXCEEDED` from your backend (bridge-nestjs `@RequireQuota`) opens the upgrade dialog. Level 1: `<bridge-quota-gate metric="tickets">` around the button (or `[bridgeQuotaGate]="'tickets'"` on it), and `<bridge-feature-flag key="analytics" [upgrade]="true">` around a paid feature. Level 2: `injectQuota('tickets')` for your own UI. Do not write a quota `if`, a "limit reached" toast, or a `/quota` endpoint.

To gate a feature by entitlement, read `bridge.tenant.entitlements` from `BridgeService`. Its `snapshot` is a signal, so a `computed` over it keeps the template current:

```ts
import { Component, computed, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-analytics-link',
  standalone: true,
  template: `@if (canAnalytics()) { <a href="/analytics">Open advanced analytics</a> }`,
})
export class AnalyticsLinkComponent {
  private readonly bridge = inject(BridgeService);
  readonly canAnalytics = computed(
    () => !!this.bridge.tenant.entitlements.snapshot()?.['advanced_analytics'],
  );
}
```

The snapshot is `null` until it loads, so the check is `false` until then (fail-closed), and it is replaced live on every entitlements change (a plan change, or a `hard` quota running out). For a one-off check in an event handler, `this.bridge.tenant.entitlements.can('advanced_analytics')` returns the same answer. Don't store the result of `can()` in a field: it's read once and never updates.

## Step 4 — Reporting usage

To make quota counters tick, report usage from your code. Fire-and-forget; the SDK queues durably:

```ts
import { inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

// In a component, service or other injection context:
inject(AuthService).getBridgeAuth().usage.report('ai_completions', 1); // value defaults to 1
```

Reporting to a metric not configured in the admin is accepted server-side but ticks no counter. Exceeding the cap always succeeds — the reaction is downstream (`metered` bills overage, `hard` flips the entitlement off).

## Step 5 — Billing portal

The "Manage billing" button (update the card, see invoices, cancel) is already on `/subscription`, next to the current plan. Do not add a second one there. To put it anywhere else — a settings page, an account menu — render `<bridge-billing-portal-button>`:

```ts
import { Component } from '@angular/core';
import { BillingPortalButtonComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [BillingPortalButtonComponent],
  template: `
    <bridge-billing-portal-button />
    <!-- or: <bridge-billing-portal-button label="Billing & invoices" className="my-button" /> -->
  `,
})
export class AccountSettingsComponent {}
```

It renders only for someone who can act on it: the workspace owner (`canManageBilling()`), on an app with payments on, whose workspace already has a plan; for everyone else it renders nothing, so no `@if` around it. On click it fetches a one-time Stripe portal URL and follows it; while that runs the button is disabled, and if it fails the error shows above the button and it can be clicked again. Inputs: `label` (default `Manage billing`), `className`.

For a fully custom button, the method is `inject(AuthService).getBridgeAuth().getBillingPortalUrl()` — there is no `getPortalUrl()`. It returns the one-time URL built from the `apiBaseUrl` you configured, so it follows your app to stage or local dev; do not hand-roll a `fetch` against a hardcoded `https://api.thebridge.dev`. The session is short-lived, so call it at click time rather than caching the result. Hide the button with `getBridgeAuth().canManageBilling()` rather than letting the call fail for a member.

A payment problem does not need this button: `<bridge-billing-notice />` (Step 2) already sends the owner to `/subscription`, and the plan picker there shows its own "Manage billing" button when the last payment failed.

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
- [ ] `...bridgeBillingRoutes()` spread inside the guarded parent in `app.routes.ts`, and `...bridgeAuthRoutes()` mounted (the Stripe return comes back through it)
- [ ] No hand-written subscription, success, cancel, `/billing` or `/payment-error` page, and no hand-written portal call or hardcoded portal URL
- [ ] `<bridge-billing-notice />` added to the root component
- [ ] Paywall: nothing added unless the developer asked for an onboarding page or a modal (then `billing.paywallRoute` set to match)
- [ ] Quota/entitlement UI added if plans have limits
- [ ] Every `createSubscriptionSignal`/`createQuotaSignal` is torn down in `ngOnDestroy`
- [ ] No extra packages installed (`@stripe/stripe-js` must NOT be in package.json)

## Verify

1. Open `/subscription` — plan cards render cheapest first; a tier with monthly + yearly pricing shows interval tabs.
2. Select a free plan — the plan changes and you land on `/subscription/success`.
3. Select a paid plan — Stripe Checkout launches.
4. Complete payment — you land on `/subscription/success` with the new plan showing.
5. Cancel payment — you are back on the page you picked from.
6. Back on `/subscription` as the workspace owner with a paid plan: "Manage billing" shows next to the current plan and opens the Stripe customer portal. Signed in as a member, it is not shown.
7. Paywall: sign in as a new workspace with no plan — you are sent to `/subscription/plan` before a guarded page renders.
8. Run the project's build command — no TypeScript or import errors.

---

> **If you are running this guide as part of `bridge guide billing` (the master prompt):** this guide is now complete. Return to the master and continue with the remaining steps (paywall, verification, success banner, follow-on tracks). Do not stop here.
