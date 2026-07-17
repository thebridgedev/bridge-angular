# Let users manage their billing

Give users a "Manage billing" entry point to the **Stripe billing portal**, where they can update their payment method, view invoices, or cancel. Bridge exposes the portal as a REST endpoint: `GET /account/subscription/portal` returns a one-time `portalUrl` to redirect to.

There's no SDK wrapper for it yet, so call the endpoint directly with the signed-in user's access token. The example uses the default API base URL, `https://api.thebridge.dev`; if you set `apiBaseUrl` in your bridge config, call that base URL instead.

```ts
import { Component } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-manage-billing',
  standalone: true,
  template: `
    <button (click)="openPortal()">Manage billing</button>
  `,
})
export class ManageBillingComponent {
  constructor(private authService: AuthService) {}

  async openPortal(): Promise<void> {
    const token = this.authService.tokens()?.accessToken;
    const res = await fetch('https://api.thebridge.dev/account/subscription/portal', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-app-id': environment.bridgeAppId,
      },
    });
    const { portalUrl } = await res.json();
    window.location.href = portalUrl;
  }
}
```

See [Subscriptions & Entitlements → Open the billing portal](/api-reference/subscriptions/#open-the-billing-portal) for the endpoint reference.

> **Recovering from a billing problem?** You don't need this button for that. When a workspace (called a *tenant* in the API) is past due, in dunning, or billing-locked, `<bridge-billing-notice />` already renders a recovery CTA (it sends the user to your billing page, `/billing` by default). Use this "Manage billing" button for the healthy, everyday case. See [Warn about billing problems](/billing/status/billing-notices/).
