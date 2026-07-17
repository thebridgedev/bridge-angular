# Guard routes

Gate entire routes behind flags with `routeConfig` rules. `RouteGuardConfig`
is imported from `@nebulr-group/bridge-angular`, and the config is passed as
the second argument to the `provideBridge(config, routeConfig)` call in
your `app.config.ts`:

> **Framework note:** the rules are enforced by `bridgeAuthGuard()`; apply it
> via `canActivateChild` on the parent route, as shown in the second file
> below.

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge({ appId: import.meta.env.NG_APP_BRIDGE_APP_ID }, routeConfig),
  ],
};

// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: 'premium', loadComponent: () => import('./premium/premium.component') },
      { path: 'beta', loadComponent: () => import('./beta/beta.component') },
    ],
  },
];
```

`defaultAccess: 'protected'` means any route no rule matches requires a
signed-in user; set it to `'public'` to leave unmatched routes open instead.

A `featureFlag` requirement on a route rule is evaluated by the SDK's route
guard, `bridgeAuthGuard()`, so it runs
on every navigation, before the route renders, against the same local flag
cache the rest of the SDK uses. It's independent of the in-component
`bridge.flag` / `<bridge-feature-flag>` surface. `provideBridge()` warms that flag
cache internally, so no extra setup is needed: declare the rule and the guard
redirects when the flag is off.

Route rules can also guard on authentication and billing state; see
[Route guards](/auth/securing/route-guards/) in the Auth section for the full
`RouteRule` reference.
