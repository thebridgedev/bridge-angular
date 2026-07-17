# Add billing to your app

**Step 3 of 3.** With [Stripe connected](/billing/setup/connect-stripe/) and your
[plans defined](/billing/setup/define-plans/), you can now use billing inside your
app. You can detect a first-time user and show them your plans, give users a
subscription page to upgrade or downgrade, and surface billing statuses, like a
payment that didn't go through. This page briefly covers each capability and links
out where we go deeper.

## Prerequisite: auth + bootstrap

Billing rides on the same setup as auth. Before anything here works you need
Bridge auth configured and `provideBridge()` registered in your `app.config.ts`.
See [Authentication](/auth/) if you haven't done that yet, and
[How billing works](/billing/how-it-works/) for the model.

## Billing state is already live, with no init call

Once `provideBridge()` runs in your `app.config.ts`, billing is **already live**. Bootstrap fetches
the subscription for the current workspace (called a *tenant* in the API),
and honors your configured billing routes.
There is **no separate billing init call**.

State lands on the unified `BridgeService` and updates over the live channel
(a persistent realtime connection the SDK maintains):

```ts
import { Component } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-plan-line',
  standalone: true,
  template: `
    @if (subscription(); as sub) {
      <p>Plan: {{ sub.plan.name }} ({{ sub.status }})</p>
    }
  `,
})
export class PlanLineComponent {
  protected readonly subscription = this.bridge.tenant.subscription; // plan, status, trial
  protected readonly entitlements = this.bridge.tenant.entitlements; // what the plan grants

  constructor(private bridge: BridgeService) {}
}
```

## Configure your billing routes

Add a `billing` block to the `BridgeConfig` you already pass to `provideBridge`
in `app.config.ts`:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const config: BridgeConfig = {
  appId: environment.bridgeAppId,
  loginRoute: '/auth/login',
  billing: {
    paywallRoute: '/subscription',       // send plan-less workspaces here
    paymentErrorRoute: '/payment-error', // land here if a checkout confirmation fails
  },
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(config)],
};
```

- **`paywallRoute`**: when set, the route guard redirects an authenticated workspace
  that hasn't selected a plan here **before the page renders**. Point it at
  wherever your `<bridge-plan-selector>` lives. (Workspaces that opt out via
  `paymentsAutoRedirect: false` are exempt.)
- **`paymentErrorRoute`**: where Bridge sends the user if a Stripe checkout
  confirmation fails on the return trip. Defaults to `/payment-error`.

Both are optional. Leave `paywallRoute` unset if you'd rather gate the app with
`<bridge-paywall>` (below) than redirect.

> **Framework note:** In Angular the paywall redirect is enforced by
> `bridgeAuthGuard()`, so register the guard on your routes (e.g.
> `canActivateChild: [bridgeAuthGuard()]`) for `paywallRoute` to take effect.
> The Stripe return trip runs through your `/auth/oauth-callback` route, which
> confirms the checkout session before landing on your redirect target; see
> [Require a plan to use the app](/billing/onboarding/require-plan/).

## Adding billing to your UI

Here are three use cases for billing in your UI:

**1. Letting users select a plan after first signup**: wrap your root component's template in
`<bridge-paywall>`; it blocks the app and shows a plan picker until the workspace
has an active plan, so a brand-new user picks a plan before they get in:

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
    <bridge-paywall successRedirect="/welcome" cancelRedirect="/subscription">
      <router-outlet />
    </bridge-paywall>
  `,
})
export class AppComponent {}
```

→ [Require a plan to use the app](/billing/onboarding/require-plan/)

**2. A self-service subscription page**: drop `<bridge-plan-selector />` onto a route. It
loads all the plans so your users can upgrade or downgrade directly from your app:

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

→ [Choose & switch plans](/billing/onboarding/choose-switch-plans/)

**3. Surface billing health**: `<bridge-billing-notice />` renders nothing while
the subscription is healthy and the right banner (trial ending, payment failed,
canceled) when it needs attention. Put it once in your root component's template:

```typescript
import { BillingNoticeComponent } from '@nebulr-group/bridge-angular';

@Component({
  // ...
  imports: [BillingNoticeComponent],
  template: `<bridge-billing-notice />`,
})
export class AppComponent {}
```

→ [Warn about billing problems](/billing/status/billing-notices/)

> That's the whole quickstart. From here, the rest of the billing section covers
> depth: [subscription status](/billing/status/subscription-status/),
> [usage limits](/billing/limits/usage-limits/),
> [free trials](/billing/lifecycle/free-trials/),
> [the billing portal](/billing/lifecycle/billing-portal/), and
> [failed-payment handling](/billing/lifecycle/failed-payments/), each building
> on the live `BridgeService` you now have wired up.
