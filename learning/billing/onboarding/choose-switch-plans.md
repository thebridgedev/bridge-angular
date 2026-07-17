# Choose & switch plans

This is the self-service billing page most apps need: one place where a user picks their first plan, upgrades, downgrades, or switches billing interval. `<bridge-plan-selector>` is the whole thing in one component. Unlike [`<bridge-paywall>`](/billing/onboarding/require-plan/), which *forces* a choice before the app loads, this is the always-available page a user visits when they choose to.

Drop `<bridge-plan-selector>` onto your subscription page. It loads the plans and the status of the current workspace (called a *tenant* in the API) automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes.

```ts
// src/app/pages/subscription/subscription.component.ts
import { Component } from '@angular/core';
import { PlanSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <bridge-plan-selector successRedirect="/subscription/success" cancelRedirect="/subscription/cancel" />
  `,
})
export class SubscriptionComponent {}
```

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/subscription'` | In-app route to land on after successful payment |
| `cancelRedirect` | `string` | `'/subscription'` | In-app route to land on if the user cancels checkout |
| `(select)` | `EventEmitter<{ plan, price }>` | (none) | Called after a free plan is selected or a plan change completes |
| `className` | `string` | `''` | Class applied to the root element |
| `style` | `string` | `''` | Inline style applied to the root element |

Under the hood, a pick branches on the price and the workspace's payment state:

- `price.amount === 0` → calls `selectFreePlan`, refreshes the subscription state
- paid + `paymentsEnabled` → calls `changePlan`, refreshes the subscription state
- paid + no payment method yet → calls `startCheckout`, launches Stripe Checkout

> **Framework note:** The selector routes Stripe's return through your
> `/auth/oauth-callback` page (with `stripe_success` / `stripe_cancel` markers)
> so the checkout session can be confirmed and tokens refreshed before the user
> lands on `successRedirect` / `cancelRedirect`. Make sure that route exists and
> handles those markers; the SDK's demo app ships a reference
> `OAuthCallbackComponent`.

**Data attributes for CSS styling:**

| Attribute | Values | When set |
|-----------|--------|----------|
| `data-bridge-plan-selector` | (no value) | Always present on root |
| `data-loading` | `"true"` / `"false"` | Loading + in-flight pick state |
| `data-state` | `"idle"` `"select-plan"` `"active"` `"trial"` `"payment-failed"` `"setup-payments"` | Current status |
| `data-bridge-plan-card` | (no value) | On each plan card |
| `data-current` | `"true"` / `"false"` | Whether this card is the current plan |
| `data-trial` | `"true"` / `"false"` | Whether this plan has a trial |
