import { Component } from '@angular/core';
import { BridgePaywallPageComponent } from '@nebulr-group/bridge-angular';

/**
 * Demo-only onboarding paywall at /welcome (`billing.paywallRoute: '/welcome'`
 * in app.config.ts), exercised by `subscription/welcome-paywall.spec.ts`.
 * Without that config line the paywall is `/subscription/plan`, which
 * `bridgeBillingRoutes()` already serves.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [BridgePaywallPageComponent],
  template: `<bridge-paywall-page heading="Welcome — choose a plan" successRedirect="/subscription" />`,
})
export class WelcomeComponent {}
