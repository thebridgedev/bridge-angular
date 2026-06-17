import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Payment-error landing. Mirrors bridge-svelte's `/payment-error` route — the
 * destination configured via `billing.paymentErrorRoute`, reached when a Stripe
 * checkout confirmation fails. PUBLIC (not behind the paywall redirect) so a
 * user whose payment errored can still see a useful message.
 */
@Component({
  selector: 'app-payment-error',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="padding: 3rem 1.5rem; max-width: 540px; margin: 0 auto; text-align: center;">
      <h1 style="font-size: 1.75rem; font-weight: 700; color: #b91c1c; margin: 0 0 0.75rem;">
        Payment could not be completed
      </h1>
      <p style="color: #6b7280; line-height: 1.6; margin: 0 0 1.5rem;">
        Something went wrong confirming your payment. No charge was finalized. You
        can try again from the plan selector.
      </p>
      <a routerLink="/welcome" class="nav-link">Back to plan selection</a>
    </div>
  `,
})
export class PaymentErrorComponent {}
