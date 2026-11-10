/**
 * TBP-744 — the component every `bridgeBillingRoutes()` page renders. Angular
 * port of bridge-svelte's `<BridgeBillingRoutes>` body:
 *   manage   the current plan, "Manage billing" and the plan picker; a
 *            completed checkout lands here, with a banner
 *   plan     the paywall: where a plan-less workspace is sent
 *   success  the old confirmation page, for `billing.successRoute`
 *   error    where a failed checkout confirmation lands
 *
 * TBP-944 (svelte TBP-813) — a paid checkout and a Free pick land on
 * `billing.successRoute`, by default these routes' own subscription page, which
 * shows `<bridge-checkout-notice>`. The current plan sits in a panel with its
 * renewal date and card, above the plan picker.
 *
 * Not normally used directly: spread `bridgeBillingRoutes()` into the router.
 */
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { BillingSubscriptionSnapshot } from '@nebulr-group/bridge-auth-core';
import { clearCheckoutResult } from '../../billing/checkout-result';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { createSubscriptionSignal, type BillingSignal } from '../../core/billing-signals';
import { resolveBillingPaths, type BridgeBillingPage } from '../../routing/billing-paths';
import {
  BRIDGE_BILLING_PAGE_DATA,
  BRIDGE_PAGE_OPTIONS_DATA,
  type BridgePageOptions,
} from '../../routing/bridge-routes';
import { routeSegments } from '../../routing/route-path';
import { AuthService } from '../../shared/services/auth.service';
import { BillingPortalButtonComponent } from '../subscription/billing-portal-button.component';
import { CheckoutNoticeComponent } from '../subscription/checkout-notice.component';
import { subscriptionMeta } from '../subscription/plan-format';
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
  imports: [BillingPortalButtonComponent, CheckoutNoticeComponent, PlanSelectorComponent, SubscriptionStatusComponent],
  template: `
    <div class="bridge-billing-page" [attr.data-bridge-billing-route]="page">
      @if (page === 'manage' && options.checkoutNotice !== false) {
        <bridge-checkout-notice />
      }
      <h1 class="bridge-billing-heading">{{ heading }}</h1>
      @switch (page) {
        @case ('manage') {
          <p class="bridge-billing-text">Your plan, what it includes, and billing.</p>
          <div class="bridge-billing-summary" data-bridge-billing-summary>
            <div class="bridge-billing-summary-plan">
              <span class="bridge-billing-label">Current plan</span>
              <bridge-subscription-status className="bridge-billing-summary-status" />
              @if (meta()) {
                <span class="bridge-billing-summary-meta" data-bridge-billing-meta>{{ meta() }}</span>
              }
            </div>
            <bridge-billing-portal-button />
          </div>
          <bridge-plan-selector heading="Change plan" [successRedirect]="successTarget" [cancelRedirect]="base" />
        }
        @case ('plan') {
          <p class="bridge-billing-text">Pick a plan to start using the app.</p>
          <bridge-plan-selector [successRedirect]="successTarget" [cancelRedirect]="at('plan')" />
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
export class BridgeBillingPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly config = inject(BridgeConfigService, { optional: true });

  protected readonly page: BridgeBillingPage = this.route.snapshot.data[BRIDGE_BILLING_PAGE_DATA] ?? 'manage';
  protected readonly options: BridgePageOptions = this.route.snapshot.data[BRIDGE_PAGE_OPTIONS_DATA] ?? {
    redirectTo: '/',
  };

  /** Links are relative to where the routes live, not hard-coded to /subscription. */
  protected readonly base = (() => {
    const segments = routeSegments(this.route.snapshot);
    const kept = this.page === 'manage' ? segments : segments.slice(0, -1);
    return kept.length ? `/${kept.join('/')}` : '/';
  })();

  protected readonly heading = this.options.heading?.(this.page) ?? DEFAULT_HEADINGS[this.page];

  protected at(sub: string): string {
    return this.base === '/' ? `/${sub}` : `${this.base}/${sub}`;
  }

  /**
   * TBP-944 — where a checkout or a Free pick lands: `billing.successRoute`, by
   * default this set's own subscription page, wherever the routes live.
   */
  protected readonly successTarget = (() => {
    let paths;
    try {
      paths = resolveBillingPaths(this.config?.getConfig().billing);
    } catch {
      paths = resolveBillingPaths(undefined);
    }
    return paths.successIsDefault ? this.base : paths.successRoute;
  })();

  /** The current plan's renewal date and card, for the line under its name. */
  private readonly billing: BillingSignal<BillingSubscriptionSnapshot> | null = (() => {
    try {
      return createSubscriptionSignal();
    } catch {
      return null; // Bridge not initialised: no meta line
    }
  })();
  protected readonly meta = computed(() => subscriptionMeta(this.billing?.value().state));

  ngOnInit(): void {
    // The success page always re-reads: the checkout just changed the plan.
    // The others read unless something already loaded it.
    const { status, loading } = this.auth.subscription();
    if (this.page === 'success' || (!status && !loading)) {
      void this.auth.loadSubscription();
    }
    // The old confirmation page says it all; no banner on the next page too.
    if (this.page === 'success') clearCheckoutResult();
  }

  ngOnDestroy(): void {
    this.billing?.destroy();
  }
}
