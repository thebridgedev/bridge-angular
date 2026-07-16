# Payments & Subscriptions

Bridge gives every workspace one canonical subscription (a plan, a status, and an optional trial) kept live in your Angular app over the Bridge live channel. When a payment fails, a trial nears its end, or an admin changes the plan in Stripe, your UI reflects it within seconds, without polling.

There are two ways to consume billing state:

1. **The `BridgeService` surface + drop-in components** (recommended): live, reactive, zero wiring.
2. **The classic subscription signal + service methods**: the original checkout flow. Still fully supported; see [Classic checkout & subscription state](#classic-checkout--subscription-state) below.

> Billing 2.0 uses the env prefix `NG_APP_` for any configuration (e.g. `NG_APP_BRIDGE_API_BASE_URL`). All components below assume `provideBridge()` has run in your `app.config.ts`.

### Live subscription state

`BridgeService` exposes the workspace's canonical subscription as an Angular **signal**. It is populated by the `session.snapshot` event when the live channel connects (and on every reconnect), then updated by live pushes:

```ts
import { Component, computed } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-plan-badge',
  standalone: true,
  template: `
    @if (subscription(); as sub) {
      <p>Plan: {{ sub.plan.name }} ({{ sub.status }})</p>
      @if (sub.endsAt) {
        <p>Renews / ends: {{ sub.endsAt | date }}</p>
      }
    }
  `,
})
export class PlanBadgeComponent {
  protected readonly subscription = this.bridge.tenant.subscription;
  constructor(private bridge: BridgeService) {}
}
```

Snapshot shape:

```ts
interface SubscriptionSnapshot {
  plan: { slug: string; name: string };
  status: string;        // "trial" | "active" | "past_due" | "cancel_at_period_end" | "canceled"
  endsAt?: string;       // trial end or cancellation date, when applicable
  gateEngaged?: boolean; // true when the workspace is billing-locked
}
```

The signal is `null` until the channel delivers the first snapshot; gate on it for a skeleton state, exactly like the example above.

### Drop-in components

All structural CSS for these components ships in `@nebulr-group/bridge-angular/styles.css`. Import it once in your root `styles.css`:

```css
@import '@nebulr-group/bridge-angular/styles.css';
```

#### `<bridge-subscription-status>`

Renders the current plan name + a status badge. Mounts and subscribes itself; no inputs required.

```ts
import { SubscriptionStatusComponent } from '@nebulr-group/bridge-angular';
// imports: [SubscriptionStatusComponent]
```

```html
<bridge-subscription-status />
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Class applied to the root span |

#### `<bridge-billing-notice>`

The unified billing banner. Renders **nothing** while the subscription is healthy, and the right notice when it needs attention: trial countdown, payment failed, dunning retries, cancellation, locked. Not dismissible; it disappears when the status flips back to healthy.

```ts
import { BillingNoticeComponent } from '@nebulr-group/bridge-angular';
```

```html
<!-- Put it once in your root component template -->
<bridge-billing-notice />
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `chassis` | `'bar' \| 'rail' \| 'card'` | `'rail'` | Visual variant |
| `mode` | `'soft' \| 'hard'` | `'soft'` | `soft` always renders inline; `hard` renders a full-screen lockscreen when the workspace is billing-locked |
| `className` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(state) => void` | (none) | Override the default CTA click handler |

States it covers: trial active, trial ending soon, past due, cancellation scheduled, canceled, dunning retry scheduled, final retry, exhausted (locked). Each state has two role variants: workspace admins get an action CTA ("Update card", "Upgrade"); members get an informational variant pointing them to their workspace owner.

#### `<bridge-quota-banner>`

A live usage-cap banner for one metric. Renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric); shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded. Updates live on `quota.updated` pushes.

```ts
import { QuotaBannerComponent } from '@nebulr-group/bridge-angular';
```

```html
<bridge-quota-banner metric="ai_completions" />
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to watch |
| `label` | `string` | metric key | Humanized display label |
| `className` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(snap) => void` | (none) | Override the default Upgrade CTA handler |

For a fully custom quota UI, read the underlying snapshot directly via the signal adapter:

```ts
import { createQuotaSignal } from '@nebulr-group/bridge-angular';

const quota = createQuotaSignal('ai_completions');
// quota.value()?.used, .limit, .remaining, .warningLevel ('approaching' | 'critical' | null)
// call quota.destroy() in ngOnDestroy
```

#### `<bridge-paywall>`

A hard gate for workspaces that haven't picked a plan yet. While `shouldSelectPlan` is true it renders a full-screen modal with a `<bridge-plan-selector>` inside; otherwise it projects its content.

```ts
import { PaywallComponent } from '@nebulr-group/bridge-angular';
```

```html
<bridge-paywall successRedirect="/welcome" cancelRedirect="/plans">
  <!-- your app: only rendered once a plan is active -->
  <router-outlet />
</bridge-paywall>
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `(select)` | `EventEmitter<{ plan, price }>` | (none) | Emitted after free-plan selection or a direct plan change |
| `heading` | `string` | "Choose a plan" | Override the modal heading |

Workspaces with `paymentsAutoRedirect: false` are exempt from the gate.

### Entitlements

Plans grant **entitlements**: named capabilities like `ai_completions` or `sso`. They arrive with the session snapshot and are replaced wholesale on every `entitlements.changed` push, so an upgrade unlocks features live. Read them off `BridgeService`:

```ts
// reactive snapshot signal
const entitlements = this.bridge.tenant.entitlements.snapshot;
// @if (entitlements()?.['ai_completions']) { <app-ai-panel /> }
```

Imperative check (synchronous, fail-closed: `false` until the snapshot lands):

```ts
if (this.bridge.tenant.entitlements.can('ai_completions')) { /* ... */ }
```

**The recommended gating pattern is a feature flag**, not a raw conditional. Create a flag (e.g. `use_ai`) with a rule targeting `bridge:billing.entitlement.ai_completions`, then gate on the flag via `BridgeService.flag()`:

```ts
const useAi = this.bridge.flag('use_ai', false);
// @if (useAi().passed) { <app-ai-panel /> }
```

This gives you everything flags give you on top of the entitlement (percentage rollouts within a plan, kill switches, per-segment overrides) without code changes. See the Feature Flags guide for the full list of `bridge:billing.*` targeting attributes.

> Entitlements are **billing-derived** (what the plan grants the workspace). They are not roles; use Bridge's role/privilege system for who-may-do-what inside a workspace.

### Billing events

For side effects (analytics, audit logs, Slack alerts) register handlers on the unified events dispatcher (`BridgeService.events`). This is separate from UI rendering, which the components above own:

```ts
const unsubscribe = this.bridge.events.handle({
  'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
  'payment.failed':            (m) => alertOps(`Payment failed (card ••••${m.cardLast4})`),
  'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
  'entitlements.changed':      (m) => analytics.track('entitlements', m),
});
```

Billing event kinds: `subscription.plan_changed`, `subscription.created` / `updated` / `canceled` / `reactivated`, `subscription.trial_started` / `trial_ending_soon` / `trial_converted` / `trial_expired`, `payment.succeeded` / `payment.failed`, `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted`, `quota.updated`, `entitlements.changed`.

Multiple handlers can register for the same kind; one throwing handler never blocks the others.

### Classic checkout & subscription state

The original checkout flow (plan picker, Stripe Checkout) remains fully supported and is what `<bridge-plan-selector>` and `<bridge-paywall>` use under the hood.

#### `<bridge-plan-selector>`

Drop `<bridge-plan-selector>` onto your subscription page. It loads plans and status automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes.

```ts
// src/app/pages/subscription/subscription.component.ts
import { PlanSelectorComponent } from '@nebulr-group/bridge-angular';
```

```html
<bridge-plan-selector
  successUrl="https://yourapp.com/subscription/success"
  cancelUrl="https://yourapp.com/subscription/cancel"
/>
```

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `successUrl` | `string` | required | Absolute URL to land on after successful payment |
| `cancelUrl` | `string` | required | Absolute URL to land on if the user cancels checkout |
| `(select)` | `EventEmitter<{ plan, price }>` | (none) | Emitted after a free plan is selected or a plan change completes |
| `className` / `style` | `string` | `''` | Forwarded to the root element |

The pick handler branches internally:
- `price.amount === 0` → calls `selectFreePlan`, refreshes state
- paid + `paymentsEnabled` → calls `changePlan`, refreshes state
- paid + no payment method yet → calls `startCheckout`, launches Stripe Checkout

> Hosted Stripe Checkout requires the optional peer dependency `@stripe/stripe-js`. Install it in your app if you take paid plans.

**Data attributes for CSS / E2E:**

| Attribute | Values | When set |
|-----------|--------|----------|
| `data-bridge-plan-selector` | (none) | Always present on root |
| `data-loading` | `"true"` / `"false"` | Loading + in-flight pick state |
| `data-state` | `"idle"` `"select-plan"` `"active"` `"trial"` `"payment-failed"` `"setup-payments"` | Current status |
| `data-bridge-plan-card` | (none) | On each plan card |
| `data-current` | `"true"` / `"false"` | Whether this card is the current plan |
| `data-trial` | `"true"` / `"false"` | Whether this plan has a trial |

#### Subscription state signal

`AuthService.subscription` is a readonly signal holding the checkout-flow state. Call `loadSubscription()` to populate it.

```ts
import { AuthService } from '@nebulr-group/bridge-angular';

// Trigger a fetch (e.g. on init, after login, after Stripe redirect)
await this.authService.loadSubscription();

// Read reactively
const { status, plans, loading, error } = this.authService.subscription();
```

Signal shape:

```ts
interface SubscriptionState {
  status: SubscriptionStatus | null;  // null until first load
  plans:  Plan[] | null;              // null until first load
  loading: boolean;
  error:  string | null;
}
```

#### Individual service methods

For custom UIs, call the BridgeAuth methods directly via `AuthService.getBridgeAuth()`:

```ts
const bridge = this.authService.getBridgeAuth();

const status = await bridge.getSubscriptionStatus();
// status.shouldSelectPlan  → show plan picker
// status.paymentFailed     → show payment error
// status.trial             → show trial countdown
// status.paymentsEnabled   → billing is active

const plans = await bridge.getPlans();
// plan.prices[n].amount === 0  → free plan (no Stripe needed)

await bridge.selectFreePlan('free');
await this.authService.loadSubscription();
```

The plan catalog is also available as a lazy slice on `BridgeService`: `await this.bridge.app.plans.load()` (fetches on first access).

`startCheckout(planKey, priceOffer, { successUrl, cancelUrl })` creates a Stripe Checkout session; `changePlan(planKey, priceOffer)` switches an active subscriber (requires `status.paymentsEnabled === true`).

#### Subscription state reference

| `SubscriptionStatus` field | Type | Meaning |
|----------------------------|------|---------|
| `shouldSelectPlan` | `boolean` | No plan chosen yet; show plan picker |
| `shouldSetupPayments` | `boolean` | Paid plan selected but checkout not completed |
| `paymentFailed` | `boolean` | Last Stripe invoice failed |
| `paymentsEnabled` | `boolean` | Active billing subscription |
| `trial` | `boolean` | Currently in trial period |
| `plan` | `Plan \| string \| undefined` | Currently active plan (if any) |

Decision tree:

```
shouldSelectPlan    → show plan picker (or just use <bridge-paywall>)
paymentFailed       → show error banner + plan cards (to switch)
shouldSetupPayments → send user through startCheckout again
trial / active      → show plan cards in "change" mode (current plan highlighted)
```
