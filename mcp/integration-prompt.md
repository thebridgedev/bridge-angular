# Bridge Angular Integration

You are integrating The Bridge into an Angular application. This adds authentication, tenant context, role and privilege access control, feature flags and billing.

Sign-in happens inside the app: the login, signup and password pages render in the app's own layout, and `...bridgeAuthRoutes()` serves every one of them. For the sign-in pages in detail, matching them to the app's design and customising them, read `sdk-auth-prompt.md` (`get_integration_guide` topic `auth`, or `bridge guide angular sdk-auth`).

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
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { bridgeInterceptor, provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  // Where a signed-out visitor is sent: the app's own login page.
  loginRoute: '/auth/login',
  // Defaults to production. Required for a stage / local / self-hosted app.
  apiBaseUrl: environment.bridgeApiBaseUrl,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // Your own API calls carry the user's token; a plan-limit 402 opens the upgrade dialog.
    provideHttpClient(withInterceptors([bridgeInterceptor])),
    provideBridge(bridgeConfig),
  ],
};
```

(If the developer explicitly asks for Bridge's hosted sign-in page, or the app already uses it, respect that: leave out `loginRoute`, sign in with `AuthService.login()` instead of a link to `/auth/login`, and log out with `AuthService.logout()`; a local or self-hosted Bridge also sets `hostedUrl`. Everything else stays the same.)

Configuration is code (Angular has no env-var convention): each option resolves as *explicit option > default*, and an empty string is unset. **An empty `appId` throws at startup, naming the option.** If `provideBridge()` itself is missing, nothing errors loudly: flags return their defaults and auth never resolves — check that first when something seems inert.

## Step 2b — Let Bridge serve its pages

```ts
// src/app/app.routes.ts
import { bridgeAuthGuard, bridgeAuthRoutes, bridgeBillingRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),                 // /auth/login, /signup, /oauth-callback, /set-password/:token, …
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      ...bridgeBillingRoutes(),          // only with plans: /subscription, /subscription/plan, /success, /error
      { path: '', component: HomeComponent },
    ],
  },
];
```

**Do not write a login page, a signup page, an OAuth callback, a set-password page, or subscription pages.** These spreads own them, including the address in every signup verification email. The sign-in pages are public by construction; to replace one, `bridgeAuthRoutes({ overrides: { login: { component: MyLogin } } })`.

## Step 3 — Guard routes declaratively

Angular gets a **declarative route guard**, like SvelteKit. Prefer it over hand-rolled checks in components: the rules live in one place and cover auth and feature flags together.

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
  { path: 'holo-lab', component: HoloLabComponent, canActivate: [bridgeAuthGuard()] },
];
```

`RouteRule` supports exactly four fields: `match`, `public`, `featureFlag` (a key, or `{ any: [...] }` / `{ all: [...] }`) and `redirectTo`.

> **There is no per-rule `billing` field.** Billing gating is app-level: a tenant without an active plan is redirected to `/subscription/plan` (for an app that has plans; `billing.paywallRoute` changes it, `false` turns it off). To gate one route on what the plan *sells*, use a `featureFlag` rule whose flag is ruled `bridge:billing.entitlement.<key> eq true` — reaching it opens the upgrade dialog. See `billing-prompt.md`.

> **Gating a whole page? Use a rule, not a component-level `if`.** A rule redirects before the component ever renders; an `if` inside the component means the page mounts, fetches, and only then hides itself — which leaks both the route's existence and whatever the page loaded on the way.

## Step 4 — Read the user, sign in and out

```ts
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (auth.isAuthenticated()) {
      <span>{{ auth.profile()?.fullName ?? auth.profile()?.email }}</span>
      <button (click)="logout()">Log out</button>
    } @else {
      <a routerLink="/auth/login">Log in</a>
    }
  `,
})
export class HeaderComponent {
  protected auth = inject(AuthService);

  logout(): Promise<void> {
    return this.auth.getBridgeAuth().logout({ redirectTo: '/auth/login' });
  }
}
```

Always pass `redirectTo` to `logout()` so the user lands on the app's own login page. A signed-out visitor on a protected route is sent to `/auth/login` and brought back to that route afterwards; the link is only for pages that are public.

`ProfileService` exposes profile fields; `realtimeStatus` reports the live-channel state.

## Checklist

- [ ] `@nebulr-group/bridge-angular` installed
- [ ] `provideBridge(bridgeConfig)` in `appConfig.providers`, with a non-empty `appId`, `loginRoute: '/auth/login'`, and `apiBaseUrl` for a stage or local app
- [ ] `...bridgeAuthRoutes()` in the routes; no hand-written login, signup, callback or set-password page
- [ ] The sign-in pages match the app's design (`sdk-auth-prompt.md`)
- [ ] Protected routes guarded with `bridgeAuthGuard()` and a `RouteGuardConfig`
- [ ] `logout()` passes `redirectTo: '/auth/login'`

## Verify it works

Do not stop at a clean build. Run it and confirm:

1. A protected route while signed out redirects to `/auth/login` **inside the app**.
2. After login you land back on that route, inside the app.
3. A reload keeps you signed in.
4. Log out: you land on the app's `/auth/login`.
5. A flag-gated route redirects when the flag is off, and is reachable when on.
6. The developer does steps 1, 2 and 4 themselves in a browser, and signs up once at `/auth/signup`; do not create test users. If a step fails, `bridge event auth-attempts --user <their email>` names the reason.

## Where to go next

| Goal | Guide |
|---|---|
| The sign-in pages, matching the app's design, customising them | `sdk-auth-prompt.md` |
| Gate features behind a flag | `feature-flags-prompt.md` |
| Plans, checkout, quotas | `billing-prompt.md` |
| Team / workspace management UI | `team-prompt.md` |

Configuring the Bridge app itself — flags, plans, roles, Stripe — happens over **MCP tools** or the **`bridge` CLI**, not in app code. Both are equivalent; use whichever you have.
