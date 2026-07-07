# Route guards

Pass a `RouteGuardConfig` as the second argument to `provideBridge()` in `app.config.ts`, then apply `bridgeAuthGuard()` via `canActivateChild` on the route(s) you want protected.

**app.config.ts:**

```ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
    { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(bridgeConfig, routeConfig),
  ],
};
```

**app.routes.ts:**

```ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
      { path: 'beta', component: BetaComponent },
      { path: 'protected', component: ProtectedComponent },
    ],
  },
];
```

`bridgeAuthGuard()` returns a standard Angular `CanActivateFn`. Applying it via `canActivateChild` on a parent route checks every child route automatically — you don't add it to each route individually.

**How it works:**

| Option | What it does |
|--------|--------------|
| `defaultAccess` | Sets whether unmatched routes are `'public'` or `'protected'`. |
| `rules` | Marks individual paths as public and/or gates them behind a feature flag. `match` accepts an exact string, a wildcard string (`'/beta/*'`), or a `RegExp`. |
| `featureFlag` | A flag key, `{ any: [...] }`, or `{ all: [...] }`. Evaluated against the hydrated Feature Flags 2.0 cache — no network round trip per navigation. |
| `redirectTo` | Where to send a user who fails the `featureFlag` requirement. Defaults to `'/'`. |
| `loginRoute` (on `BridgeConfig`) | Unauthenticated users hitting a protected route are redirected here (in-app), instead of Bridge's hosted login page. Leave it unset to use hosted auth — see the [hosted quickstart](../../quickstart/hosted-quickstart.md). |

Redirects are handled automatically inside `bridgeAuthGuard()` — it returns `true` (allow), a `UrlTree` (redirect), or triggers `window.location.href` for an out-of-app redirect to the hosted login page.

## The paywall redirect

If your `BridgeConfig` sets `billing.paywallRoute`, the same guard also redirects an authenticated tenant that hasn't selected a plan to that route before a protected page renders — gated on `getSubscriptionStatus().shouldSelectPlan` (and skipped when `paymentsAutoRedirect` is `false`, or while a Stripe/OAuth callback is in flight). See [Configurations](../config/config.md) for the full `billing` options.
