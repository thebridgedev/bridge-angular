import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';
import { BetaComponent } from './pages/beta/beta.component';
import { HomeComponent } from './pages/home/home.component';
import { OAuthCallbackComponent } from './pages/oauth-callback/oauth-callback.component';
import { ProtectedComponent } from './pages/protected/protected.component';
import { TeamComponent } from './pages/team/team.component';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
      { path: 'protected', component: ProtectedComponent },
      { path: 'team', component: TeamComponent },
      { path: 'beta', component: BetaComponent },
    ],
  },
];
