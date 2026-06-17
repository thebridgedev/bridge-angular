import { Component } from '@angular/core';
import { PlanSelectorComponent } from '@nebulr-group/bridge-angular';

/**
 * Welcome / paywall route — renders the PlanSelector for the first-time-user
 * paywall flow exercised by `subscription/welcome-paywall.spec.ts`.
 *
 * PUBLIC route (excluded from the paywall redirect via `billing.paywallRoute`
 * + a `{ match: '/welcome', public: true }` route-guard rule in app.config.ts).
 * The paywall *redirect* — bouncing a no-plan authenticated user here from a
 * protected route on `shouldSelectPlan + paymentsAutoRedirect` — is wired in
 * bridge-angular's route guard (route-guard.ts), the Angular analogue of
 * bridge-svelte's BridgeBootstrap paywall gate.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <div style="padding: 2rem; max-width: 720px; margin: 0 auto;">
      <h1>Welcome — choose a plan</h1>
      <bridge-plan-selector successRedirect="/subscription" cancelRedirect="/welcome" />
    </div>
  `,
})
export class WelcomeComponent {}
