# Choose & switch plans

This is the self-service billing page most apps need: one place where a user picks their first plan, upgrades, downgrades, or switches billing interval. `<bridge-plan-selector>` is the whole thing in one component. Unlike [`<bridge-paywall>`](/billing/onboarding/require-plan/), which *forces* a choice before the app loads, this is the always-available page a user visits when they choose to.

**`bridgeBillingRoutes()` already serves this page** at `/subscription` (with the current plan and a "Manage billing" button), plus `/subscription/success` and `/subscription/error` for the checkout return. Use the component directly only for a page of your own.

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
    <bridge-plan-selector successRedirect="/subscription/success" cancelRedirect="/subscription" />
  `,
})
export class SubscriptionComponent {}
```

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/subscription'` | In-app route to land on after successful payment |
| `cancelRedirect` | `string` | `'/subscription'` | In-app route to land on if the user cancels checkout |
| `defaultInterval` | `'day' \| 'week' \| 'month' \| 'year'` | `'year'` | Interval tab selected first; falls back to the first offered one |
| `(select)` | `EventEmitter<{ plan, price }>` | (none) | Called after a free plan is selected or a plan change completes. Without a listener, the picker goes on to `successRedirect` |
| `planCardTemplate` | `TemplateRef<PlanCardTemplateContext>` | (none) | Replaces each whole card. Context: `plan`, `prices`, `isCurrent`, `interval`, `onPick(price)` |
| `planDescriptionTemplate` | `TemplateRef<PlanPartTemplateContext>` | (none) | Replaces the default card's description. Context: `plan`, `isCurrent` |
| `planFooterTemplate` | `TemplateRef<PlanPartTemplateContext>` | (none) | Rendered at the bottom of the default card. Context: `plan`, `isCurrent` |
| `emptyStateTemplate` / `loadingStateTemplate` | `TemplateRef` | (none) | Replace the empty and loading states |
| `className` | `string` | `''` | Class applied to the root element |
| `style` | `string` | `''` | Inline style applied to the root element |

Under the hood, a pick branches on the price and the workspace's payment state:

- `price.amount === 0` (and no metered cost) → calls `selectFreePlan`, refreshes the subscription state, then goes to `successRedirect`
- paid + `paymentsEnabled` → asks first ("Change plan?" naming both plans and the price, since the switch is instant), then calls `changePlan` on confirm and refreshes the subscription state
- paid + no payment method yet → calls `startCheckout`, launches Stripe Checkout

> **Framework note:** The selector routes Stripe's return through
> `/auth/oauth-callback` (served by `bridgeAuthRoutes()`, at your `callbackUrl`)
> with `stripe_success` / `stripe_cancel` markers, so the checkout session is
> confirmed and tokens refreshed before the user lands on `successRedirect` /
> `cancelRedirect`.

**Customising a card without rewriting it** (the ng-template mirror of bridge-svelte's `planCard` / `planDescription` / `planFooter` snippets):

```html
<ng-template #desc let-plan="plan"><p>{{ plan.name }} — everything in Free, plus more.</p></ng-template>
<ng-template #foot let-plan="plan" let-isCurrent="isCurrent">
  @if (!isCurrent) { <small>Cancel anytime.</small> }
</ng-template>
<bridge-plan-selector [planDescriptionTemplate]="desc" [planFooterTemplate]="foot" />
```

The default card also lists each plan's features (the same list the upgrade dialog reads), sorts plans cheapest first, and offers Monthly / Yearly tabs when prices come in more than one interval.

**Data attributes for CSS styling:**

| Attribute | Values | When set |
|-----------|--------|----------|
| `data-bridge-plan-selector` | (no value) | Always present on root |
| `data-loading` | `"true"` / `"false"` | Loading + in-flight pick state |
| `data-state` | `"idle"` `"select-plan"` `"active"` `"trial"` `"payment-failed"` `"setup-payments"` | Current status |
| `data-bridge-plan-card` | (no value) | On each plan card |
| `data-current` | `"true"` / `"false"` | Whether this card is the current plan |
| `data-trial` | `"true"` / `"false"` | Whether this plan has a trial |
