# How Bridge works

The rules every Bridge guide builds on, on one page: what the smallest integration is, where a plan limit is counted, the three ways to show a limit in the UI, and the four levels of customising Bridge's pages. Coding agents get the same page from `bridge guide mechanisms`.

The frontend examples are Angular (`@nebulr-group/bridge-angular`); the backend examples are NestJS (`@nebulr-group/bridge-nestjs`).

Who gets which feature, and how plans, roles, limits and flags divide the work, is on its own page: `bridge guide fit-together`. In short: every gate in app code is a flag, and its rule says why (a privilege, a plan feature, a rollout).

## The whole integration

What a developer's repo holds once Bridge is in. Nothing else is required; every other page Bridge needs, it serves.

**Frontend (Angular) — about ten lines in two files, plus one stylesheet line:**

```ts
// src/app/app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { bridgeInterceptor, provideBridge } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([bridgeInterceptor])),
    provideBridge({ appId: environment.bridgeAppId, loginRoute: '/auth/login' }),
  ],
};
```

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes, bridgeBillingRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),                             // every sign-in page, under /auth
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],           // every other route needs a signed-in user
    children: [
      ...bridgeBillingRoutes(),                      // /subscription, the paywall, checkout returns
      // …your app's routes
    ],
  },
];
```

```css
/* src/styles.css */
@import '@nebulr-group/bridge-angular/styles.css';
```

`bridgeAuthRoutes()` and `bridgeBillingRoutes()` return plain lazy `Routes` arrays (`loadComponent`): spread them where you like. Without plans, leave out `bridgeBillingRoutes()`.

**Backend (NestJS) — 4 lines, plus one line of environment.** See the bridge-nestjs docs, "Plan limits": `BridgeModule.forRoot({ guard: { global: true } })` and `@RequireQuota('exports')` on the handler that does the work.

**Settings are code.** Angular has no environment-variable convention, so `provideBridge()` takes everything from your own `environment.ts`. Each field resolves as *explicit option > default* — the same chain as every other Bridge plugin, with the environment step empty; an empty string counts as unset.

| Option | When to set it |
|---|---|
| `appId` | Always. Missing, Bridge refuses to start and names the option |
| `apiBaseUrl` | Only for a non-production app (stage, local, self-hosted). Unset means production; in development the console says so once |
| `hostedUrl` | Only for a local or self-hosted Bridge. On Bridge's own domains it follows `apiBaseUrl` (`api-stage` → `auth-stage`) |
| `loginRoute` | `'/auth/login'` for in-app sign-in. Unset means hosted sign-in |
| `debug` | `true` for console logging |

## 1. Decide once, where the action happens

Ask one question first: **does this action call your server?**

- **It calls your backend:** the backend handler counts it and refuses at the limit. The frontend shows the count and the upgrade dialog, and does not count the same metric again.
- **It happens in the browser** and never reaches a server of yours: the browser counts it (`inject(BridgeService).usage.report('exports')`, or `.usage.set('projects', n)` for a gauge) and `<bridge-quota-gate>` stops the button at the limit. That is a complete, first-class setup.

Never both for one metric: it would be counted twice.

## 2. A POST increments the limit

The backend decorator **is** the increment (bridge-nestjs `@RequireQuota`). At the plan's limit the request is refused with `402` and `{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }`, which the Angular plugin understands. Only a `2xx` answer records a use; a retry with the same `Idempotency-Key` is counted once.

## 3. Counter or gauge

**If deleting it frees room, it's a gauge and your app counts it; if it happened, it's a counter and Bridge counts it.** Counters reset every billing period ("40 of 100 this month"); gauges never reset ("8 of 10 projects"). `injectQuota(metric)().kind` tells you which one a metric is.

A plan *feature* (`analytics`, `sso`) is not a limit: it goes in the plan's features list and is gated with a flag whose rule is `bridge:billing.entitlement.analytics eq true`.

## 4. Three ways to handle a limit in the UI

Pick the lowest level that does the job. Each is optional; level 0 is on without page code.

| Level | What the page writes | What the user sees |
|---|---|---|
| **0 — nothing** | calls your API with `HttpClient` (with `bridgeInterceptor` provided once) or `bridgeFetch()` | Your backend refuses at the cap (`402`), and the **upgrade dialog** `provideBridge()` mounts opens, naming the metric and linking to the subscription page. A workspace member who cannot manage billing is told to ask the owner instead |
| **1 — one component or directive** | `<bridge-quota-gate metric="tickets">` around the button (or `[bridgeQuotaGate]="'tickets'"` on it); `<bridge-feature-flag key="analytics" [upgrade]="true">` around a paid feature | The button is disabled at a known hard cap with an upgrade line beside it; the paid feature shows on a plan that includes it, and elsewhere an "Upgrade to use this" button that opens the dialog when clicked |
| **2 — your own UI** | `injectQuota('tickets')`, and `<bridge-feature-flag key="analytics">` around what the plan sells | Whatever you build from the live numbers |

```ts
import { Component } from '@angular/core';
import { FeatureFlagComponent, QuotaGateComponent, injectQuota } from '@nebulr-group/bridge-angular';

@Component({
  standalone: true,
  imports: [QuotaGateComponent, FeatureFlagComponent],
  template: `
    <!-- level 1 -->
    <bridge-quota-gate metric="tickets">
      <button (click)="createTicket()">New ticket</button>
    </bridge-quota-gate>

    <!-- the flag's rule: bridge:billing.entitlement.analytics eq true -->
    <bridge-feature-flag key="analytics" [upgrade]="true">
      <a routerLink="/analytics">Analytics</a>
    </bridge-feature-flag>

    <!-- level 2 -->
    @if (tickets().loading) { Loading… }
    @else if (tickets().unlimited) { Unlimited tickets }
    @else { {{ tickets().used }} of {{ tickets().limit }} tickets }
  `,
})
export class TicketsComponent {
  readonly tickets = injectQuota('tickets');
  createTicket() { /* this.http.post('/api/tickets', …) */ }
}
```

- "Not loaded yet" is never "zero" and never "not allowed": `injectQuota` numbers stay `null` while `loading`, and `<bridge-quota-gate>` stays enabled while loading.
- No upgrade dialog opens by itself: it opens on a `402` from your backend, when someone opens a route whose flag is off because of the plan, or when they click an upgrade prompt.
- `bridgeInterceptor` sends the user's token only to the page's own origin, Bridge's API and the origins in `billing.apiOrigins`, and reads refusals from those only. A backend on another origin goes in `billing.apiOrigins`. `billing: { upgradeDialog: false }` turns the dialog off (listen with `onBridgeQuotaExceeded()`), `billing: { upgradeDialog: MyDialog }` replaces it — `MyDialog` receives `BridgeUpgradeDialogInputs` as inputs.
- Do not write a quota `if`, a "limit reached" toast or a `/quota` endpoint of your own: level 0 already covers the refusal.

## 5. Four levels of customising Bridge's pages

The same ladder holds for the sign-in pages (`bridgeAuthRoutes()`) and the subscription pages (`bridgeBillingRoutes()`). Climb only as far as you need.

| Rung | What you do | What you own |
|---|---|---|
| **0 — nothing** | Bridge's pages render in your `<router-outlet>` | Your navigation, header and shell already surround them |
| **1 — tokens** | Set `--bridge-*` CSS variables in your CSS | Colours, radius, spacing |
| **2 — frame and heading** | `bridgeAuthRoutes({ frame: AuthLayoutComponent, heading: (page) => … })` | Everything around the form on every page (the frame is a layout component with its own `<router-outlet>`), and each page's heading |
| **3 — take over one page** | `bridgeAuthRoutes({ overrides: { login: { component: MyLoginComponent } } })`, or your own route for that address placed before the spread | That one page; every other page keeps working |
| **4 — headless** | Build your own UI on `AuthService.getBridgeAuth()` | Everything |

```ts
// rung 2
...bridgeAuthRoutes({
  frame: AuthCardComponent, // template: <main class="auth-card"><router-outlet /></main>
  heading: (page) => (page === 'signup' ? 'Create your account' : page === 'login' ? 'Welcome back' : null),
}),
```

`heading` replaces only each page's main heading; return `null` to keep a page's default. A sign-in page you own navigates itself after sign-in: `(login)="router.navigateByUrl(readReturnTo(location.href) ?? '/')"`.

**The token contract (rung 1).** The same `--bridge-*` variables as every Bridge plugin; the full table is in [theming](theming/theming.md). The plugin declares its defaults on `:where(:root)`, which has zero specificity, so your `:root` wins whichever stylesheet loads first. Leaving out the stylesheet makes the components headless: plain HTML for you to style.

## 6. Pages Bridge serves, and the one it only offers

- **Sign-in:** `bridgeAuthRoutes()` serves `/auth/login`, `/auth/signup`, `/auth/oauth-callback`, `/auth/set-password/:token` (where signup verification and password-reset emails land), `/auth/forgot-password`, `/auth/magic-link`, `/auth/setup-passkey/:token` and `/auth/workspaces`. They are public by construction (the guard honours their route data). Which methods appear comes from the app's settings at runtime. Hosted and in-app sign-in use the same routes; `loginRoute: '/auth/login'` is the whole switch to in-app.
- **Subscription:** `bridgeBillingRoutes()` serves `/subscription`, the paywall `/subscription/plan`, and the checkout return pages `/subscription/success` and `/subscription/error`. These are the defaults of `billing.manageRoute`, `billing.paywallRoute` and `billing.paymentErrorRoute`, so Bridge's redirects and upgrade links point at pages that exist.
- **The paywall** redirects a signed-in workspace with no plan to `/subscription/plan` before a protected page renders — only when the app has plans and its `paymentsAutoRedirect` setting is on (the default). `billing: { paywallRoute: false }` turns it off.
- **A `/welcome` onboarding page is offered, never created unasked.** Only if the developer wants one: a route rendering `<bridge-paywall-page />` and `billing: { paywallRoute: '/welcome' }` in `provideBridge()`.
- Any other address falls through to the app's own `**` route.

## Exceptions

Checking a plan feature without a flag (`*bridgeEntitled="'analytics'"` or `injectEntitlements()().can('analytics')` in the UI, `@RequireEntitlement` on the backend) exists for the rare case where the developer explicitly asks for no flag. It prints a one-time note in development; mark the line `// bridge-gate-exception: <reason>` so `bridge check gates` leaves it.
