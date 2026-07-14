# Guard routes

Gate entire routes behind flags with `routeConfig` rules. Pass the config as the
second argument to `provideBridge()`, and apply `bridgeAuthGuard()` via
`canActivateChild` on the parent route:

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
```

```typescript
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

A `featureFlag` requirement on a route rule is evaluated by `bridgeAuthGuard()`
before the route renders — it reads the hydrated FF 2.0 flag cache
synchronously, independent of the in-component `bridge.flag` /
`<bridge-feature-flag>` surface. The runtime warms the flag cache at bootstrap,
so no extra setup is needed: declare the rule and the guard redirects to
`redirectTo` (defaulting to `/`) when the flag is off.

A `featureFlag` value can be:

- a single flag key (`'premium-feature'`) — allowed when that flag passes;
- `{ any: [...] }` — allowed when **any** listed flag passes;
- `{ all: [...] }` — allowed when **all** listed flags pass.

See [Route guards](/auth/securing/route-guards/) for the full guard config,
including auth-based protection and the paywall redirect.
