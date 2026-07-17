# How billing works

Bridge gives every workspace **one canonical subscription**: a plan, a status, and an optional trial, kept live in your app over the Bridge live channel (a persistent realtime connection the SDK maintains). When a payment fails, a trial nears its end, or an admin changes the plan in Stripe, your UI reflects it within seconds, without polling.

One naming note up front: in the API a workspace is called a **tenant**, which is why all the billing state on this page lives on `bridge.tenant.*`.

## Why Bridge billing, not Stripe directly

You could integrate Stripe yourself. Bridge billing runs on top of Stripe and gives you the parts you'd otherwise have to build:

- **Your app never holds Stripe secrets or calls Stripe.** Bridge manages the connection, checkout, the customer portal, and webhooks server-side.
- **A plan → entitlement/quota model on top of raw Stripe prices.** Gate features and meter usage without building that layer yourself (see below).
- **Live subscription state, pushed to every client.** No polling and no webhook plumbing in your app: the workspace's plan and status arrive over the live channel and update in place.
- **Drop-in UI.** Plan selector, paywall, billing notices, and quota banners instead of hand-building checkout and portal screens.
- **The messy lifecycle, handled.** Trials, dunning (automated payment retries), cancellation, and reactivation, each surfaced as an event you can hook.
- **Per-workspace and backend-enforceable.** Billing is tied to the authenticated workspace, and entitlements/quotas can be enforced on your server from verified billing truth, not just in the browser.

## A plan grants two kinds of things

When a workspace is on a plan, that plan controls access in two distinct ways:

- **Entitlements: on/off capabilities.** *Does this plan include feature X?* A yes/no switch per feature (e.g. AI, SSO, advanced reports). There's no "amount"; you either have it or you don't. → [Lock features to a plan](/billing/limits/lock-features/)
- **Quotas: usage allowances.** *How much of X can they use?* A counter with a limit (e.g. 10,000 AI calls/month, 20 seats). You can be entitled to a feature and still run out of it. → [Show usage limits in your app](/billing/limits/usage-limits/)

| | Entitlement | Quota |
|---|---|---|
| Question | Can they use it at all? | How much is left? |
| Shape | boolean (yes/no) | number (used / limit) |
| Runs out? | No | Yes |

> Entitlements and quotas are **billing-derived** (what the plan grants the workspace). They are not roles: use Bridge's role & privilege system for who-may-do-what inside a workspace.

## Subscription state is live

The unified `BridgeService` exposes the workspace's canonical subscription as a reactive signal. It is populated by the session snapshot (the initial state payload delivered when the live channel connects, and again on every reconnect), then updated by live pushes:

```ts
import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-plan-line',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (subscription(); as sub) {
      <p>Plan: {{ sub.plan.name }} ({{ sub.status }})</p>
      @if (sub.endsAt) {
        <p>Renews / ends: {{ sub.endsAt | date }}</p>
      }
    }
  `,
})
export class PlanLineComponent {
  protected readonly subscription = this.bridge.tenant.subscription;

  constructor(private bridge: BridgeService) {}
}
```

Snapshot shape:

```ts
interface SubscriptionSnapshot {
  plan: { slug: string; name: string };
                         // slug is the plan key you set when creating the plan
  status: string;        // "trial" | "active" | "past_due" | "cancel_at_period_end" | "canceled"
  endsAt?: string;       // trial end or cancellation date, when applicable
  gateEngaged?: boolean; // true when the workspace is billing-locked (see below)
}
```

The signal is `null` until the channel delivers the first snapshot; gate on it for a skeleton state, exactly like the example above.

## When billing locks the app

Two flags gate access, and the rest of this section refers back to them, so here is the one place they're defined:

- **`shouldSelectPlan`** lives on the subscription status the checkout flow uses. It is the *onboarding* gate: `true` while the workspace has no active plan, `false` the moment one is selected or checked out. [`<bridge-paywall>`](/billing/onboarding/require-plan/) and the config paywall redirect key off it.
- **`gateEngaged`** lives on the snapshot above. It is the *lock* signal: the server sets it when a subscription lapses, for example when a trial expires without converting or when dunning (automated payment retries) is exhausted after a failed payment. `<bridge-billing-notice mode="hard" />` renders its lockscreen from it, and API calls from a locked workspace can start failing with a billing-locked error.

"**Billing-locked**" is the prose term for that second state: the subscription has lapsed or no plan is active anymore, so the app should be gated until the workspace picks a plan again or fixes payment. Both gates resolve the same way (the workspace activates a plan or payment recovers) and the lifecycle pages, [Offer free trials](/billing/lifecycle/free-trials/) and [Handle failed payments](/billing/lifecycle/failed-payments/), both funnel into this mechanism rather than defining flags of their own.

## How to consume billing state

Read state from the **`BridgeService`** (`bridge.tenant.subscription`, `bridge.tenant.entitlements`) and use the **drop-in components** for UI. It's live, reactive, and needs zero wiring. This is what the rest of this section uses, and it's the path you should reach for.

**Read the subscription** to drive your own UI; the signal updates in place when the plan or status changes:

```ts
import { Component } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-plan-link',
  standalone: true,
  template: `
    @if (subscription()?.status === 'active') {
      <a href="/subscription">Manage plan</a>
    } @else {
      <a href="/subscription">Upgrade</a>
    }
  `,
})
export class PlanLinkComponent {
  protected readonly subscription = this.bridge.tenant.subscription;

  constructor(private bridge: BridgeService) {}
}
```

**Read an entitlement** to gate a feature on what the plan grants. In markup, read the reactive snapshot signal so the gate re-evaluates when entitlements change:

```ts
import { Component } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-ai-section',
  standalone: true,
  template: `
    @if (entitlements()?.['ai_completions']) {
      <app-ai-panel />
    }
  `,
})
export class AiSectionComponent {
  protected readonly entitlements = this.bridge.tenant.entitlements.snapshot;

  constructor(private bridge: BridgeService) {}
}
```

For imperative checks outside markup (event handlers, resolvers), `can()` is the synchronous read. It is fail-closed (`false` until the snapshot lands) and **not reactive**, so don't call it directly in an `@if` block; the block would never re-render when entitlements change:

```ts
if (this.bridge.tenant.entitlements.can('ai_completions')) { /* ... */ }
```

**For UI, prefer a drop-in component** over wiring your own; each reads the same live state:

- [`<bridge-plan-selector>`](/billing/onboarding/choose-switch-plans/): plan cards + checkout/switch
- [`<bridge-paywall>`](/billing/onboarding/require-plan/): gate the app until a plan is active
- [`<bridge-billing-notice>`](/billing/status/billing-notices/): trial/past-due/canceled banners
- [`<bridge-quota-banner>`](/billing/limits/usage-limits/): usage-cap warnings for a metric
- [`<bridge-subscription-status>`](/billing/status/subscription-status/): a compact plan + status badge

> **Tip:** Building a fully custom plan picker or checkout flow the drop-in components can't express? The lower-level subscription signal and service methods they're built on are available; see [Use subscription management on its own](/billing/advanced/standalone/). Reach for it only then.

On the backend, read the same subscription state and entitlements over REST: see [Check plans on your backend](/billing/advanced/backend-checks/) and the [Subscriptions & Entitlements](/api-reference/subscriptions/) API reference.
