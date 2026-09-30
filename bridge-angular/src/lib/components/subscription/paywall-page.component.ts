/**
 * TBP-744 — `<bridge-paywall-page>`: a paywall page at an address of the app's
 * choosing, e.g. onboarding at `/welcome`. Angular port of bridge-svelte's
 * `<BridgePaywallPage>` (TBP-702).
 *
 *   { path: 'welcome', component: WelcomeComponent }   // template: <bridge-paywall-page heading="Pick a plan" />
 *   provideBridge({ …, billing: { paywallRoute: '/welcome' } })
 *
 * `bridgeBillingRoutes()` already serves a paywall at `/subscription/plan`;
 * this is only for an app that wants its own. A completed checkout lands on
 * `<billing.manageRoute>/success`; a cancelled one comes back here.
 */
import { Component, Input, OnInit, inject, isDevMode } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { resolveBillingPaths } from '../../routing/billing-paths';
import { routeSegments } from '../../routing/route-path';
import { logger } from '../../shared/logger';
import { PlanSelectorComponent } from './plan-selector.component';

@Component({
  selector: 'bridge-paywall-page',
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <div class="bridge-paywall-page" data-bridge-paywall-page>
      <h1 class="bridge-paywall-page-heading">{{ heading }}</h1>
      <ng-content></ng-content>
      <bridge-plan-selector [successRedirect]="success" [cancelRedirect]="cancel" />
    </div>
  `,
})
export class BridgePaywallPageComponent implements OnInit {
  /** The page heading. */
  @Input() heading = 'Choose a plan';
  /** Where a completed checkout lands. @default `<billing.manageRoute>/success` */
  @Input() successRedirect?: string;
  /** Where a cancelled checkout lands. @default this page */
  @Input() cancelRedirect?: string;

  private readonly config = inject(BridgeConfigService);
  private readonly route = inject(ActivatedRoute, { optional: true });

  /** This page's path, from the matched route (the router's URL lags during the first navigation). */
  private get here(): string {
    const segments = routeSegments(this.route?.snapshot);
    return `/${segments.join('/')}`;
  }

  private get paths() {
    try {
      return resolveBillingPaths(this.config.getConfig().billing);
    } catch {
      return resolveBillingPaths(undefined);
    }
  }

  protected get success(): string {
    return this.successRedirect ?? this.paths.successRoute;
  }

  protected get cancel(): string {
    return this.cancelRedirect ?? this.here;
  }

  ngOnInit(): void {
    const here = this.here;
    const paywall = this.paths.paywallRoute;
    if (isDevMode() && paywall !== here) {
      logger.warn(
        `[bridge] <bridge-paywall-page> is on ${here}, but plan-less workspaces are sent to ` +
          `${paywall ?? '(nowhere — the paywall redirect is off)'}. ` +
          `Add billing: { paywallRoute: '${here}' } to provideBridge().`,
      );
    }
  }
}
