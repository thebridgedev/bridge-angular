import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** Stripe checkout success return page (parity with svelte `/subscription/success`). */
@Component({
  selector: 'app-subscription-success',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container content" data-bridge-subscription-success>
      <h1 class="heading-xl">Payment successful</h1>
      <p class="text-lead">Your subscription is now active.</p>
      @if (payment()) {
        <p class="note" data-payment-param>payment={{ payment() }}</p>
      }
      <a routerLink="/subscription" class="nav-link">Back to subscription</a>
    </div>
  `,
})
export class SubscriptionSuccessComponent implements OnInit {
  protected readonly payment = signal<string | null>(null);
  constructor(private route: ActivatedRoute) {}
  ngOnInit(): void {
    this.payment.set(this.route.snapshot.queryParamMap.get('payment'));
  }
}
