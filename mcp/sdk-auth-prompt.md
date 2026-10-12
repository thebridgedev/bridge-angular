# Bridge Angular — Authentication

You are wiring authentication into an Angular application that uses The Bridge. Sign-in happens inside the app: the login, signup and password pages render in the app's own layout, and users never leave it. `...bridgeAuthRoutes()` serves every one of those pages; you write no login, signup, callback or set-password page.

## The components — reach for these, do not hand-roll

| Need | Component |
|---|---|
| Sign in | `<bridge-login-form>` |
| Sign up | `<bridge-signup-form>` |
| Forgot password | `<bridge-forgot-password>` (also inline in the login form) |
| Magic link | `<bridge-magic-link>` |
| Passkey login | `<bridge-passkey-login>` |
| Passkey setup | `<bridge-passkey-setup>`, `<bridge-passkey-request-setup-link>` |
| MFA challenge / setup | `<bridge-mfa-challenge>`, `<bridge-mfa-setup>` |
| Workspace ("tenant") selection | `<bridge-workspace-selector>`, `<bridge-tenant-selector>` |
| SSO button | `<bridge-sso-button>` |

> **`<bridge-login-form>` is not just an email and password box.** It drives forgot-password, magic link, passkeys, MFA and workspace selection as inline steps, and it decides which methods to show from the app's own configuration — which the client cannot see. Rebuilding any of it means reimplementing a flow that exists and then keeping it in sync with settings you have no visibility of.
>
> If you are about to write a password input, check whether the login form already covers the case.

## Prerequisites

1. `@nebulr-group/bridge-angular` installed.
2. `provideBridge(bridgeConfig)` in `appConfig.providers` (see `integration-prompt.md`).
3. `appId` set and non-empty.

## Step 1 — Point the config at your login route

```ts
const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  loginRoute: '/auth/login',
  // Defaults to production. Required for a stage / local / self-hosted app —
  // without it a stage app ID hits the production API and signup fails
  // with "Not Found".
  apiBaseUrl: environment.bridgeApiBaseUrl || undefined,
};
```

(If the developer explicitly asks for Bridge's hosted sign-in page, or the app already uses it, respect that: leave out `loginRoute`, sign in with `AuthService.login()` instead of a link to `/auth/login`, and log out with `AuthService.logout()`; a local or self-hosted Bridge also sets `hostedUrl`. Everything else stays the same.)

## Step 2 — Spread the auth routes

```ts
// src/app/app.routes.ts
import { bridgeAuthGuard, bridgeAuthRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),
  { path: '', canActivateChild: [bridgeAuthGuard()], children: [/* your routes */] },
];
```

That serves login, signup, the OAuth callback, set password (the address in every signup verification and password-reset email), forgot password, magic link, passkey setup and workspace selection. They are public by construction — no route rule needed, and no redirect loop.

## Match the app's design — always

The sign-in pages render inside the app, so they must look like the rest of it. Bridge's built-in look (indigo buttons, grey borders) is a fallback for an app with no design, never the finished result. Do this without asking:

1. **Read the app's design.** The global stylesheet (`src/styles.css` / `styles.scss`, as listed under `styles` in `angular.json`) and its CSS variables, `tailwind.config.*` or the Tailwind `@theme` block, a component library's theme (Angular Material, PrimeNG, Taiga, …), the font the app loads, and one existing primary button and text input.
2. **Set the `--bridge-*` tokens from it** in that global stylesheet, pointing at the app's own variables rather than copying values, so dark mode and later theme changes carry over:

   ```css
   :root {
     --bridge-primary: var(--color-primary);          /* the app's primary button background */
     --bridge-primary-hover: var(--color-primary-hover);
     --bridge-primary-fg: var(--color-primary-foreground);
     --bridge-border: var(--color-border);
     --bridge-input-focus: var(--color-ring);
     --bridge-border-radius: var(--radius);
     --bridge-foreground: var(--color-foreground);
     --bridge-muted: var(--color-muted-foreground);
     --bridge-bg: var(--color-background);
     --bridge-muted-bg: var(--color-muted);
   }
   ```

   The names on the right are examples: use the variables the app actually defines, or its literal values when it has none. Map its error and success colours to the `--bridge-alert-*` tokens. The components inherit the page font; set nothing for it unless the app puts its font on something other than `body`. The full token list: `bridge guide mechanisms`.
3. **Give the pages the app's frame** when the app's own pages sit in a card, a panel or a split layout: pass `bridgeAuthRoutes({ frame: AuthLayoutComponent })` with a component that wraps `<ng-content>` in the app's own card or shell, built from the app's own classes or components, so sign-in is not the one page that looks different.

Ask the developer for colours only when the project has no styles of its own.

Customise further only as far as needed: `--bridge-*` CSS tokens (above); `bridgeAuthRoutes({ frame: AuthLayoutComponent, heading: (page) => … })`; replace one page with `overrides: { login: { component: MyLoginComponent } }` (a page you own renders `<bridge-login-form (login)="…">` and navigates itself).

## Step 3 — Guard the rest

Use the declarative `RouteGuardConfig` + `bridgeAuthGuard` from `integration-prompt.md` rather than checking auth inside each component. Rules run before the component renders; a component-level check renders, fetches, and only then hides.

## Reading the user

Inject `AuthService` for auth state and `ProfileService` for profile fields. To log out, call `getBridgeAuth().logout({ redirectTo: '/auth/login' })` on `AuthService` so the user lands on the app's own login page. For the raw token — to call your own backend — take it from the auth service, send it as `Authorization: Bearer <token>`, and verify it server-side with `@nebulr-group/bridge-nestjs` or `@nebulr-group/bridge-express`.

> **Never make an authorization decision on the client alone.** Hiding a control is UX. The check that matters happens on the server against the verified token.

## Common mistakes

- **Hand-rolling a password form** instead of `<bridge-login-form>` — loses magic link, passkeys, MFA and workspace selection, all configured server-side.
- **Writing login/signup/callback pages by hand** — `bridgeAuthRoutes()` already serves them; a hand-written set usually forgets `set-password/:token`, which every signup email links to.
- **Leaving out `loginRoute`.** The guard then sends signed-out visitors off the app instead of to `/auth/login`.
- **Logging out without `redirectTo`.** The user then leaves the app instead of landing on `/auth/login`.
- **Trusting auth state for authorization.** It says a session exists, not what it may do.
- **Expecting an NgModule.** These are standalone components; import them into `imports: []`.

## Configuring auth methods

Which methods appear (password, magic link, passkeys, SSO, MFA) is **app configuration, not code** — set over MCP (`update_app`, `enable_auth_methods`), the `bridge` CLI, or the dashboard. The login form reflects it automatically. Do not add inputs trying to force a method on; change the app config.

## Related guides

- `integration-prompt.md` — `provideBridge`, route guard
- `feature-flags-prompt.md` — gating on flags
- `team-prompt.md` — team management UI
