# Use subscription management on its own

This is the **lower-level API** for building custom checkout UIs: the subscription signal and service methods that `<bridge-plan-selector>` and `<bridge-paywall>` are built on under the hood. Reach for it when you need a plan picker or checkout flow the drop-in components can't express; otherwise consume billing state from the `BridgeService` as shown in [How billing works](/billing/how-it-works/).

## Subscription state signal

`AuthService.subscription` is a readonly Angular signal that holds the checkout-flow state. Call `loadSubscription()` to populate it.

In a component template, read it reactively by calling the signal:

```ts
import { Component, OnInit } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-plans-panel',
  standalone: true,
  template: `
    @if (subscription().loading) {
      <p>Loading plans…</p>
    } @else if (subscription().status?.shouldSelectPlan) {
      <p>Pick a plan to continue.</p>
    }
  `,
})
export class PlansPanelComponent implements OnInit {
  protected readonly subscription = this.authService.subscription;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    // Trigger a fetch (e.g. on init, after sign-in, after the Stripe redirect)
    void this.authService.loadSubscription();
  }
}
```

In plain TypeScript code, take a one-off imperative read by calling the signal (note that the destructured values are a point-in-time read, not reactive):

```ts
await this.authService.loadSubscription();

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

`AuthService.subscription` is shared across all components. Calling `loadSubscription()` once from a parent page is enough.

## Individual service methods

For custom UIs that don't use `<bridge-plan-selector>`, call the service methods directly:

```ts
import { AuthService } from '@nebulr-group/bridge-angular';

// inject AuthService, then:
const bridge = this.authService.getBridgeAuth();
```

**`getSubscriptionStatus()`**: fetch the subscription status of the current workspace (called a *tenant* in the API):

```ts
const status = await this.authService.getBridgeAuth().getSubscriptionStatus();
// status.shouldSelectPlan  → show plan picker
// status.paymentFailed     → show payment error + portal link
// status.trial             → show trial countdown
// status.paymentsEnabled   → billing is active
```

**`getPlans()`**: fetch all available plans:

```ts
const plans = await this.authService.getBridgeAuth().getPlans();
// plan.prices[n].amount === 0  → free plan (no Stripe needed)
```

The plan catalog is also available on the `BridgeService` as `await bridge.app.plans` (fetched on first access and cached).

**`selectFreePlan(planKey)`**: immediately activate a free plan:

```ts
await this.authService.getBridgeAuth().selectFreePlan('free');
await this.authService.loadSubscription(); // refresh the signal
```

**`startCheckout(planKey, priceOffer, options)`**: create a Stripe Checkout session and redirect. Pass one of the plan's price offers (from `getPlans()`):

```ts
const plans = await this.authService.getBridgeAuth().getPlans();
const pro = plans.find((p) => p.key === 'pro')!;
const monthly = pro.prices.find((pr) => pr.recurrenceInterval === 'month')!;

const session = await this.authService.getBridgeAuth().startCheckout('pro', monthly, {
  successUrl: 'https://yourapp.com/subscription/success',
  cancelUrl: 'https://yourapp.com/subscription/cancel',
});

if (session.sessionId === null) {
  // Stripe isn't configured on this app; the plan was set directly
  await this.authService.loadSubscription();
} else {
  window.location.href = session.checkoutUrl!;
}
```

Relative `successUrl` / `cancelUrl` paths are resolved against the current origin, so `/subscription/success` works too.

**`changePlan(planKey, priceOffer)`**: switch an active subscriber to a different plan:

> Requires `status.paymentsEnabled === true`. Use `startCheckout` for new subscribers.

```ts
const enterprise = plans.find((p) => p.key === 'enterprise')!;
await this.authService.getBridgeAuth().changePlan('enterprise', enterprise.prices[0]);
await this.authService.loadSubscription();
```

## Subscription state reference

| `SubscriptionStatus` field | Type | Meaning |
|----------------------------|------|---------|
| `shouldSelectPlan` | `boolean` | No plan chosen yet: show the plan picker |
| `shouldSetupPayments` | `boolean` | Paid plan selected but checkout not completed |
| `paymentFailed` | `boolean` | Last Stripe invoice failed: direct the user to the portal |
| `paymentsEnabled` | `boolean` | Active billing subscription |
| `paymentsAutoRedirect` | `boolean` | When `false`, the workspace has opted out of the platform's native plan-selection gate |
| `trial` | `boolean` | Currently in trial period |
| `plan` | `Plan \| string \| undefined` | Current plan. The REST endpoint returns the full `Plan` object; JWT-derived paths return the plan key as a string |

Decision tree:

```
shouldSelectPlan    → show plan picker (or just use <bridge-paywall>)
paymentFailed       → show error banner + "Manage billing" + plan cards (to switch)
shouldSetupPayments → send user through startCheckout again
trial / active      → show plan cards in "change" mode (current plan highlighted)
```
