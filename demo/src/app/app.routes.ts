import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';
import { BetaComponent } from './pages/beta/beta.component';
import { FlagContextDemoComponent } from './pages/flag-context-demo/flag-context-demo.component';
import { FlagDemoComponent } from './pages/flag-demo/flag-demo.component';
import { HomeComponent } from './pages/home/home.component';
import { OAuthCallbackComponent } from './pages/oauth-callback/oauth-callback.component';
import { ProtectedComponent } from './pages/protected/protected.component';
import { TeamComponent } from './pages/team/team.component';
import { TeamPanelComponent } from './pages/team-panel/team-panel.component';
import { WorkspacesComponent } from './pages/workspaces/workspaces.component';
import { SubscriptionComponent } from './pages/subscription/subscription.component';
import { SubscriptionSuccessComponent } from './pages/subscription/subscription-success.component';
import { SubscriptionCancelComponent } from './pages/subscription/subscription-cancel.component';
import { SubscriptionRelativeComponent } from './pages/subscription-relative/subscription-relative.component';
import { ApiTokensComponent } from './pages/api-tokens/api-tokens.component';
import { SdkLoginComponent } from './pages/sdk-auth/sdk-login.component';
import { SdkSignupComponent } from './pages/sdk-auth/sdk-signup.component';
import { SdkMagicLinkComponent } from './pages/sdk-auth/sdk-magic-link.component';
import { SdkForgotPasswordComponent } from './pages/sdk-auth/sdk-forgot-password.component';
import { SdkSetPasswordComponent } from './pages/sdk-auth/sdk-set-password.component';
import { SdkSetupPasskeyComponent } from './pages/sdk-auth/sdk-setup-passkey.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';
import { PaymentErrorComponent } from './pages/payment-error/payment-error.component';

export const routes: Routes = [
  // SDK auth — public, in-app auth UI (registered outside the guarded group).
  { path: 'auth/login', component: SdkLoginComponent },
  { path: 'auth/signup', component: SdkSignupComponent },
  { path: 'auth/magic-link', component: SdkMagicLinkComponent },
  { path: 'auth/forgot-password', component: SdkForgotPasswordComponent },
  { path: 'auth/set-password/:token', component: SdkSetPasswordComponent },
  { path: 'auth/setup-passkey/:token', component: SdkSetupPasskeyComponent },
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
      { path: 'protected', component: ProtectedComponent },
      { path: 'team', component: TeamComponent },
      { path: 'team-panel', component: TeamPanelComponent },
      { path: 'workspaces', component: WorkspacesComponent },
      { path: 'beta', component: BetaComponent },
      { path: 'flag-demo', component: FlagDemoComponent },
      { path: 'flag-context-demo', component: FlagContextDemoComponent },
      { path: 'welcome', component: WelcomeComponent },
      { path: 'payment-error', component: PaymentErrorComponent },
      { path: 'subscription', component: SubscriptionComponent },
      { path: 'subscription/success', component: SubscriptionSuccessComponent },
      { path: 'subscription/cancel', component: SubscriptionCancelComponent },
      { path: 'subscription-relative', component: SubscriptionRelativeComponent },
      { path: 'api-tokens', component: ApiTokensComponent },
    ],
  },
];
