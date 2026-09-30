
## @nebulr-group/bridge-angular

Bridge Angular library. Add Bridge auth, feature flags, and payments to your Angular 19 apps.

### Install

```bash
npm i @nebulr-group/bridge-angular
```

### Usage — the whole integration

See the `demo/` app for end-to-end wiring, and `learning/mechanisms.md` for the rules on one page.

#### app.config.ts

```ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { bridgeInterceptor, provideBridge } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([bridgeInterceptor])), // your API calls carry the token; a plan-limit 402 opens the upgrade dialog
    provideBridge({ appId: environment.bridgeAppId, loginRoute: '/auth/login' }),
  ],
};
```

#### app.routes.ts

```ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes, bridgeBillingRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),               // login, signup, OAuth callback, set password, magic link, passkey setup, workspaces
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      ...bridgeBillingRoutes(),        // /subscription, the paywall /subscription/plan, checkout returns
      { path: '', component: HomeComponent },
    ],
  },
];
```

#### styles.css

```css
@import '@nebulr-group/bridge-angular/styles.css';
```

Configuration is code (Angular has no env-var convention): each option resolves as *explicit option > default*, an empty string is unset, a missing `appId` throws naming it, and `hostedUrl` follows `apiBaseUrl` on Bridge's domains.

Plan limits, lowest level first: level 0 needs nothing (the upgrade dialog opens on a `402` from your backend); level 1 is `<bridge-quota-gate metric="…">` / `[bridgeQuotaGate]` and `<bridge-feature-flag key="…" [upgrade]="true">`; level 2 is `injectQuota(metric)` / `injectEntitlements()`.

### Build

```bash
npm run build
```

Artifacts are emitted to `dist/` via `ng-packagr`.

### Release (branch-protected main)

```bash
# 1) Create release branch
git checkout -b release/v0.1.0
git push -u origin release/v0.1.0

# 2) Open a PR: release/v0.1.0 -> main, approve and merge

# 3) After merge to main, tag and push
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0

# 4) Monitor GitHub Actions "Publish to npm"
```

### License
MIT © thebridgedev
