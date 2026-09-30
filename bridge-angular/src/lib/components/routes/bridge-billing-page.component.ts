/**
 * TBP-744 — the component every `bridgeBillingRoutes()` page renders. Angular
 * port of bridge-svelte's `<BridgeBillingRoutes>` body:
 *   manage   the current plan, "Manage billing" and the plan picker
 *   plan     the paywall: where a plan-less workspace is sent
 *   success  where a completed checkout (or a Free pick) lands
 *   error    where a failed checkout confirmation lands
 *
 * Not normally used directly — spread `bridgeBillingRoutes()` into the router.
 */
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { BridgeBillingPage } from '../../routing/billing-paths';
import {
  BRIDGE_BILLING_PAGE_DATA,
  BRIDGE_PAGE_OPTIONS_DATA,
  type BridgePageOptions,
} from '../../routing/bridge-routes';
import { AuthService } from '../../shared/services/auth.service';
import { BillingPortalButtonComponent } from '../subscription/billing-portal-button.component';
import { PlanSelectorComponent } from '../subscription/plan-selector.component';
import { SubscriptionStatusComponent } from '../subscription/subscription-status.component';

const DEFAULT_HEADINGS: Record<BridgeBillingPage, string> = {
  manage: 'Subscription',
  plan: 'Choose a plan',
  success: "You're all set",
  error: "We couldn't confirm your payment",
};

@Component({
  selector: 'bridge-billing-page',
  standalone: true,
  imports: [BillingPortalButtonComponent, PlanSelectorComponent, SubscriptionStatusComponent],
  template: `
    <div class="bridge-billing-page" [attr.data-bridge-billing-route]="page">
      <h1 class="bridge-billing-heading">{{ heading }}</h1>
      @switch (page) {
        @case ('manage') {
          <div class="bridge-billing-current">
            <span class="bridge-billing-label">Current plan</span>
            <bridge-subscription-status />
            <bridge-billing-portal-button />
          </div>
          <bridge-plan-selector [successRedirect]="at('success')" [cancelRedirect]="base" />
        }
        @case ('plan') {
          <p class="bridge-billing-text">Pick a plan to start using the app.</p>
          <bridge-plan-selector [successRedirect]="at('success')" [cancelRedirect]="at('plan')" />
        }
        @case ('success') {
          <p class="bridge-billing-text">Your plan is active.</p>
          <div class="bridge-billing-current">
            <span class="bridge-billing-label">Current plan</span>
            <bridge-subscription-status />
          </div>
          <a class="bridge-btn-primary bridge-billing-action" [attr.href]="options.redirectTo">Continue</a>
        }
        @case ('error') {
          <p class="bridge-billing-text">
            The payment may still have gone through. Check your subscription in a moment; if it has not
            changed, try again.
          </p>
          <a class="bridge-btn-primary bridge-billing-action" [attr.href]="base">Back to subscription</a>
        }
      }
    </div>
  `,
})
export class BridgeBillingPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly page: BridgeBillingPage = this.route.snapshot.data[BRIDGE_BILLING_PAGE_DATA] ?? 'manage';
  protected readonly options: BridgePageOptions = this.route.snapshot.data[BRIDGE_PAGE_OPTIONS_DATA] ?? {
    redirectTo: '/',
  };

  /** Links are relative to where the routes live, not hard-coded to /subscription. */
  protected readonly base = (() => {
    const segments = this.route.snapshot.pathFromRoot.flatMap((r) => r.url.map((s) => s.path));
    const kept = this.page === 'manage' ? segments : segments.slice(0, -1);
    return kept.length ? `/${kept.join('/')}` : '/';
  })();

  protected readonly heading = this.options.heading?.(this.page) ?? DEFAULT_HEADINGS[this.page];

  protected at(sub: string): string {
    return this.base === '/' ? `/${sub}` : `${this.base}/${sub}`;
  }

  ngOnInit(): void {
    // The success page always re-reads: the checkout just changed the plan.
    // The others read unless something already loaded it.
    const { status, loading } = this.auth.subscription();
    if (this.page === 'success' || (!status && !loading)) {
      void this.auth.loadSubscription();
    }
  }
}
