# Require a plan to use the app

Some apps shouldn't do anything until the workspace (called a *tenant* in the API) is on a plan. "Requiring a plan" means blocking the app until the current workspace has an **active plan**, and letting it through the moment one exists.

A plan counts as active once the workspace has either:

- **selected a free plan** (instant, no payment involved), or
- **completed Stripe Checkout for a paid plan** (a payment method is captured).

Under the hood the gate keys off a single flag on the subscription status: **`shouldSelectPlan`**. While it's `true` the workspace has no active plan and the app should stay blocked; once a plan is selected or checked out it flips to `false` and the app opens up. You never compute this yourself; Bridge derives it from the workspace's billing state. (This is the onboarding gate. A workspace that *had* a plan and lost it, say after exhausted payment retries, is **billing-locked** instead, which is a separate signal. See [How billing works](/billing/how-it-works/#when-billing-locks-the-app) for how the two relate.)

There are two ways to enforce the gate. Lead with `<bridge-paywall>`, the default, blessed approach, and reach for the config paywall route when you'd rather the plan picker be a real routed page than a modal overlay.

## Method 1: `<bridge-paywall>` (recommended)

`<bridge-paywall>` is a hard gate you wrap around your app: it blocks everything until a plan is active, with no `shouldSelectPlan` checks or redirects to wire yourself. Put it in your root component's template and project your app as its content.

While `shouldSelectPlan` is true it renders a full-screen modal with a `<bridge-plan-selector>` inside; otherwise it renders its projected content (your app).

```ts
// src/app/app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PaywallComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PaywallComponent],
  template: `
    <bridge-paywall successRedirect="/welcome" cancelRedirect="/plans">
      <!-- your app: only rendered once a plan is active -->
      <router-outlet />
    </bridge-paywall>
  `,
})
export class AppComponent {}
```

> **Framework note:** Your app is passed via content projection and rendered by
> `<ng-content>` only when a plan is active. Angular initializes projected
> content with the parent view, though, so components behind the gate may be
> constructed (but not attached to the DOM) while the modal is up. If nothing
> behind the gate may run before a plan is active, prefer the config paywall
> route (Method 2).

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `(select)` | `EventEmitter<{ plan, price }>` | (none) | Called after free-plan selection or a direct plan change (not the Stripe redirect path); use for analytics side-effects |
| `heading` | `string` | "Choose a plan" | Override the modal heading |
| (content) | projected content | (none) | Your app. Rendered only once a plan is active |

What the user sees: a workspace with no plan lands on a full-screen modal with the plan picker and cannot get past it. The instant they pick a plan (or return from checkout), the modal disappears and your app renders in its place.

## Method 2: config paywall route

Prefer this when you want the plan picker to be a **real routed page** rather than a modal overlay, for example a dedicated `/plans` onboarding step with its own layout, copy, and URL you can link to.

Set `billing.paywallRoute` in the `BridgeConfig` you pass to `provideBridge` in `app.config.ts`:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const config: BridgeConfig = {
  appId: environment.bridgeAppId,
  billing: {
    paywallRoute: '/plans',
  },
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(config)],
};
```

Then render a `<bridge-plan-selector>` at that route:

```ts
// src/app/pages/plans/plans.component.ts
import { Component } from '@angular/core';
import { PlanSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <bridge-plan-selector successRedirect="/welcome" cancelRedirect="/plans" />
  `,
})
export class PlansComponent {}
```

`bridgeAuthGuard()` handles the gate for you: before any page renders it checks the subscription status, and if the authenticated workspace still needs to pick a plan it issues a redirect to `paywallRoute`. It only redirects when all of the following hold, so there's no redirect loop and no gate on exempt workspaces:

- `billing.paywallRoute` is configured
- the current path isn't already the paywall route
- the workspace is authenticated but has `shouldSelectPlan: true`
- the workspace hasn't opted out via `paymentsAutoRedirect: false`

> **Framework note:** The gate is a route guard, so register it on your routes
> (e.g. `canActivateChild: [bridgeAuthGuard()]` on your root route group). The
> guard also exempts an in-flight auth/checkout callback navigation, so a Stripe
> return can reach `/auth/oauth-callback` and confirm the checkout before
> `shouldSelectPlan` flips.

> **Tip:** `<bridge-plan-selector>` is the same picker `<bridge-paywall>` renders inside its modal. See [Choose & switch plans](/billing/onboarding/choose-switch-plans/) for its full input table and customization options.

## The end-to-end flow

Both methods drive the same underlying flow:

1. A user signs in to a workspace that has **no active plan** → `shouldSelectPlan` is `true`.
2. The **gate** engages: the `<bridge-paywall>` modal appears, or `bridgeAuthGuard()` redirects to your `paywallRoute` page.
3. The user picks a plan from the `<bridge-plan-selector>`:
   - **Free plan** → activated instantly, no payment. `(select)` fires and the subscription state refreshes.
   - **Paid plan** → the user is sent to **Stripe Checkout** to capture a payment method.
4. On successful payment the user returns to your app at **`successRedirect`**; if they cancel, they land on **`cancelRedirect`**.
5. With a plan now active, `shouldSelectPlan` flips to `false` → the **gate opens** and your app renders.

> **Framework note:** In Angular the Stripe return trip routes through your
> `/auth/oauth-callback` page carrying `stripe_success` / `stripe_cancel`
> markers. Your callback handler confirms the session with the Bridge API
> (`POST /v1/account/stripe/confirm-checkout`), refreshes tokens, reloads the
> subscription, then redirects to `successRedirect` / `cancelRedirect` (and to
> your `paymentErrorRoute` if confirmation fails). The SDK's demo app ships a
> reference `OAuthCallbackComponent` implementing exactly this.

## Opting out: `paymentsAutoRedirect: false`

`paymentsAutoRedirect` is a flag on the subscription status. When it's `false`, the workspace **has opted out of the platform's native plan-selection gate**; such workspaces are exempt from the automatic block. Both methods above respect it: `<bridge-paywall>` renders its projected content instead of the modal, and `bridgeAuthGuard()` skips the paywall redirect entirely.

This exists so certain workspaces can bypass the forced plan choice, for example accounts provisioned or billed out-of-band, where forcing a plan selection in the app would be wrong. Those workspaces still reach your app normally; you're free to render your own `<bridge-plan-selector>` where it makes sense, but the platform won't block them for you.

`successRedirect` and `cancelRedirect` are independent of this flag; they're simply where the user lands after leaving Stripe Checkout (success or cancel, respectively). They default to `'/'` on `<bridge-paywall>`.
