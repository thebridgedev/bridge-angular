import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Stripe checkout cancel return page (parity with svelte `/subscription/cancel`). */
@Component({
  selector: 'app-subscription-cancel',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container content" data-bridge-subscription-cancel>
      <h1 class="heading-xl">Checkout canceled</h1>
      <p class="text-lead">No changes were made to your subscription.</p>
      <a routerLink="/subscription" class="nav-link">Back to subscription</a>
    </div>
  `,
})
export class SubscriptionCancelComponent {}
