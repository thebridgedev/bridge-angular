# Let users manage their billing

Give users a "Manage billing" entry point to the **Stripe billing portal**, where they can update their payment method, view invoices, or cancel. Bridge exposes the portal as a REST endpoint: `GET /account/subscription/portal` returns a one-time `portalUrl` to redirect to.

`<bridge-billing-portal-button>` is that button, ready-made. It fetches a one-time portal URL at click time and follows it, and renders only for someone who can act on it: the workspace owner, on an app with payments on, whose workspace already has a plan. The subscription page `bridgeBillingRoutes()` serves at `/subscription` already shows it, next to the current plan.

```ts
import { Component } from '@angular/core';
import { BillingPortalButtonComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [BillingPortalButtonComponent],
  template: `
    <bridge-billing-portal-button />
    <bridge-billing-portal-button label="Billing & invoices" className="my-button" />
  `,
})
export class AccountSettingsComponent {}
```

While the portal session is being created the button is disabled; if it can't be created, the error shows above the button and it can be clicked again.

To build your own, the SDK wraps the endpoint: `getBridgeAuth().getBillingPortalUrl()` returns the one-time URL. It builds the request from the `apiBaseUrl` you passed to `provideBridge()` and attaches the signed-in user's token and app ID for you, so the same code works on stage and local dev. Call it at click time — the portal session is short-lived, so don't cache the result.

```ts
import { Component, inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-manage-billing',
  standalone: true,
  template: `
    <button (click)="openPortal()">Manage billing</button>
  `,
})
export class ManageBillingComponent {
  private readonly authService = inject(AuthService);

  async openPortal(): Promise<void> {
    window.location.href = await this.authService.getBridgeAuth().getBillingPortalUrl();
  }
}
```

Prefer this over a hand-rolled `fetch`: hardcoding `https://api.thebridge.dev` sends a stage or local app to the production API, where its app ID doesn't exist. `apiBaseUrl` on your `BridgeConfig` is what points the SDK elsewhere.

Only the workspace owner may open the portal. `getBridgeAuth().canManageBilling()` returns whether the signed-in user qualifies — use it to hide or disable the button rather than letting the call fail.

See [Subscriptions & Entitlements → Open the billing portal](/api-reference/subscriptions/#open-the-billing-portal) for the endpoint reference.

> **Recovering from a billing problem?** You don't need this button for that. When a workspace (called a *tenant* in the API) is past due, in dunning, or billing-locked, `<bridge-billing-notice />` already renders a recovery CTA (it sends the user to your subscription page, `billing.manageRoute`, `/subscription` by default). Use this "Manage billing" button for the healthy, everyday case. See [Warn about billing problems](/billing/status/billing-notices/).
