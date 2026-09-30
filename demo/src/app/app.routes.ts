import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes, bridgeBillingRoutes } from '@nebulr-group/bridge-angular';
import { BetaComponent } from './pages/beta/beta.component';
import { FlagContextDemoComponent } from './pages/flag-context-demo/flag-context-demo.component';
import { FlagDemoComponent } from './pages/flag-demo/flag-demo.component';
import { HomeComponent } from './pages/home/home.component';
import { ProtectedComponent } from './pages/protected/protected.component';
import { TeamComponent } from './pages/team/team.component';
import { TeamPanelComponent } from './pages/team-panel/team-panel.component';
import { WorkspacesComponent } from './pages/workspaces/workspaces.component';
import { SubscriptionRelativeComponent } from './pages/subscription-relative/subscription-relative.component';
import { ApiTokensComponent } from './pages/api-tokens/api-tokens.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';

export const routes: Routes = [
  // Every sign-in page (login, signup, OAuth callback, set password, forgot
  // password, magic link, passkey setup, workspaces) — public, from one line.
  ...bridgeAuthRoutes(),
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      // The subscription page, the paywall and both checkout return pages.
      ...bridgeBillingRoutes(),
      { path: '', component: HomeComponent },
      { path: 'protected', component: ProtectedComponent },
      { path: 'team', component: TeamComponent },
      { path: 'team-panel', component: TeamPanelComponent },
      { path: 'workspaces', component: WorkspacesComponent },
      { path: 'beta', component: BetaComponent },
      { path: 'flag-demo', component: FlagDemoComponent },
      { path: 'flag-context-demo', component: FlagContextDemoComponent },
      // Demo-only: an onboarding paywall at /welcome (billing.paywallRoute).
      { path: 'welcome', component: WelcomeComponent },
      { path: 'subscription-relative', component: SubscriptionRelativeComponent },
      { path: 'api-tokens', component: ApiTokensComponent },
    ],
  },
];
