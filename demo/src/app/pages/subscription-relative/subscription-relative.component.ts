import { Component } from '@angular/core';
import { PlanSelectorComponent } from '@nebulr-group/bridge-angular';

/**
 * Subscription demo using RELATIVE success/cancel URLs (parity with svelte's
 * `/subscription-relative` route). Verifies the PlanSelector accepts relative
 * paths; the `?payment=` param is preserved by the OAuth callback round-trip.
 */
@Component({
  selector: 'app-subscription-relative',
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <div class="container content">
      <h1 class="heading-xl">Subscription (relative URLs)</h1>
      <bridge-plan-selector
        successRedirect="/subscription/success?payment=success"
        cancelRedirect="/subscription/cancel?payment=cancel"
      />
    </div>
  `,
})
export class SubscriptionRelativeComponent {}
