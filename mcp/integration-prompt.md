# Bridge Angular Integration

You are integrating The Bridge into an Angular application. This adds authentication, tenant context, role and privilege access control, feature flags and billing.

## Decide first — which login surface?

This decision shapes everything else. Make it before writing code; getting it wrong means rewriting the auth pages.

| You want | Use | What you build |
|---|---|---|
| The fastest path; Bridge owns the login UI | **Hosted auth** (default) | Nothing — no login page |
| Login inside your app, your styling | **SDK auth** | Your own routes rendering `<bridge-login-form>` etc. |

**Setting `loginRoute` in `BridgeConfig` is the entire switch.** Without it you get hosted; with it you get in-app. If you are being redirected to a route you never built, that field is why.

If the user has not said which they want, ask.

## Prerequisites

- **appId** — from `get_app` (MCP), `bridge app get` (CLI), or the dashboard.
- **An Angular 17+ app** using standalone components and `ApplicationConfig`.
- **Package manager** — whatever the project already uses.

## Step 1 — Install

```bash
npm i @nebulr-group/bridge-angular
```

**One entry point.** There is no `/flags` or `/billing` subpath and no separate provider per capability — everything imports from `@nebulr-group/bridge-angular`. If you find yourself reaching for a subpath, it does not exist.

## Step 2 — Provide Bridge

`provideBridge()` registers an `APP_INITIALIZER` that boots the Bridge runtime: auth, the flag evaluation cache, billing state and the realtime channel, all on one connection.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  // Defaults to production. Required for a stage / local / self-hosted app.
  apiBaseUrl: environment.bridgeApiBaseUrl || undefined,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(bridgeConfig),
  ],
};
```

> **If `provideBridge()` is missing or `appId` is empty, nothing errors loudly.** Flags return their defaults, auth never resolves, and the app looks like it is simply configured that way. An empty `environment.bridgeAppId` is indistinguishable from "every flag is off" — check this first when something seems inert.

## Step 3 — Guard routes declaratively

Angular gets a **declarative route guard**, like SvelteKit. Prefer it over hand-rolled checks in components: the rules live in one place and cover auth, flags and billing together.

```ts
// src/app/app.config.ts
import { provideBridge, type RouteGuardConfig } from '@nebulr-group/bridge-angular';

const routeConfig: RouteGuardConfig = {
  defaultAccess: 'protected',
  rules: [
    { match: '/', public: true },
    { match: '/pricing', public: true },
    // Gate a whole route on a feature flag:
    { match: '/holo-lab', featureFlag: 'holo-experimental', redirectTo: '/' },
    // Gate on billing:
    { match: '/reports/*', billing: 'hard' },
  ],
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(bridgeConfig, routeConfig)],
};
```

Then attach the guard on the routes it should run for:

```ts
// src/app/app.routes.ts
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'holo-lab', component: HoloLabComponent, canActivate: [bridgeAuthGuard] },
];
```

`RouteRule` supports `match`, `public`, `featureFlag` (a key, or `{ any: [...] }` / `{ all: [...] }`), `redirectTo` and `billing`.

> **Gating a whole page? Use a rule, not a component-level `if`.** A rule redirects before the component ever renders; an `if` inside the component means the page mounts, fetches, and only then hides itself — which leaks both the route's existence and whatever the page loaded on the way.

## Step 4 — Read the user

```ts
import { Component, inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({ selector: 'app-header', standalone: true, template: `…` })
export class HeaderComponent {
  private auth = inject(AuthService);
}
```

`ProfileService` exposes profile fields; `realtimeStatus` reports the live-channel state.

## Verify it works

Do not stop at a clean build. Run it and confirm:

1. A protected route while signed out starts the login flow.
2. After login you land **inside the app**.
3. A reload keeps you signed in.
4. A flag-gated route redirects when the flag is off, and is reachable when on.

## Where to go next

| Goal | Guide |
|---|---|
| Login/signup inside your app | `sdk-auth-prompt.md` |
| Gate features behind a flag | `feature-flags-prompt.md` |
| Plans, checkout, quotas | `billing-prompt.md` |
| Team / workspace management UI | `team-prompt.md` |

Configuring the Bridge app itself — flags, plans, roles, Stripe — happens over **MCP tools** or the **`bridge` CLI**, not in app code. Both are equivalent; use whichever you have.
