import { Component } from '@angular/core';
import {
  PlanSelectorComponent,
  SubscriptionStatusComponent,
  QuotaBannerComponent,
} from '@nebulr-group/bridge-angular';

/**
 * Subscription demo page (parity with bridge-svelte's `/subscription` route).
 * Renders the Billing 2.0 PlanSelector + the live subscription-status and
 * quota-banner surfaces. The selector routes the Stripe return through the
 * OAuth callback (confirm-checkout) before landing back on these pages.
 */
@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [PlanSelectorComponent, SubscriptionStatusComponent, QuotaBannerComponent],
  template: `
    <div class="container content">
      <h1 class="heading-xl">Subscription</h1>
      <p class="text-lead">
        Current plan: <bridge-subscription-status />
      </p>

      <bridge-quota-banner metric="num.clicks" />

      <bridge-plan-selector
        successRedirect="/subscription/success"
        cancelRedirect="/subscription/cancel"
      />
    </div>
  `,
})
export class SubscriptionComponent {}
