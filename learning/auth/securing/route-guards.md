import { Tabs, TabItem } from '@astrojs/starlight/components';

# Route guards

Pass `routeConfig` as the second argument to `provideBridge` in `app.config.ts`, then apply `bridgeAuthGuard()` via `canActivateChild` in `app.routes.ts`; it handles navigation guards automatically.

<Tabs>
<TabItem label="app.config.ts">

```ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },
    { match: '/beta/*', featureFlag: 'beta_feature', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(config, routeConfig),
  ],
};
```

</TabItem>
<TabItem label="app.routes.ts">

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

</TabItem>
</Tabs>

> **Framework note:** `bridgeAuthGuard()` returns a standard Angular `CanActivateFn`. Applying it via `canActivateChild` on a parent route checks every child route automatically, so you don't add it to each route individually. It reads the rules from the `routeConfig` you passed to `provideBridge`.

**How it works:**

| Option | What it does |
|--------|--------------|
| `defaultAccess` | Sets whether unmatched routes are `'public'` or `'protected'`. |
| `rules` | Marks individual paths as public and/or gates them behind feature flags. |
| Unauthenticated access | Unauthenticated users hitting a protected route are redirected to Bridge's hosted login page. |

Redirects are handled automatically by `bridgeAuthGuard()`. For the full `RouteRule` shape, and the billing paywall redirect driven by `billing.paywallRoute`, see the [config reference](/auth/config/#route-guard-config).
