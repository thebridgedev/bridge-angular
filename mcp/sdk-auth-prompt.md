# Bridge Angular — Authentication

You are wiring authentication into an Angular application that uses The Bridge.

## Decide first — hosted or in-app?

| You want | Mode | What you build | Config |
|---|---|---|---|
| Bridge owns the login UI | **Hosted** (default) | Nothing — no login page | No `loginRoute` |
| Login inside your app, your styling | **SDK auth** | Your own routes rendering `<bridge-login-form>` | Set `loginRoute` |

**One config field is the whole switch.** Adding `loginRoute` to `BridgeConfig` turns hosted mode off. If you are being redirected to a route you never built, that is why.

If the user has not said which they want, ask. A wrong guess here means rewriting the auth pages.

The rest of this guide covers **SDK auth**.

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
| Hosted-login entry point | `<bridge-login>` |

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

## Step 2 — Build the auth pages

Components are standalone — import them directly, no NgModule:

```ts
// src/app/auth/login-page.component.ts
import { Component } from '@angular/core';
import { LoginFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [LoginFormComponent],
  template: `<bridge-login-form />`,
})
export class LoginPageComponent {}
```

```ts
// src/app/auth/signup-page.component.ts
import { Component } from '@angular/core';
import { SignupFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [SignupFormComponent],
  template: `<bridge-signup-form />`,
})
export class SignupPageComponent {}
```

Register both as **public** routes, or the guard will redirect the login page to itself:

```ts
const routeConfig: RouteGuardConfig = {
  defaultAccess: 'protected',
  rules: [
    { match: '/auth/login', public: true },
    { match: '/auth/signup', public: true },
  ],
};
```

That redirect loop is the most common mistake in this guide, and it presents as a hung page rather than an error.

## Step 3 — Guard the rest

Use the declarative `RouteGuardConfig` + `bridgeAuthGuard` from `integration-prompt.md` rather than checking auth inside each component. Rules run before the component renders; a component-level check renders, fetches, and only then hides.

## Reading the user

Inject `AuthService` for auth state and `ProfileService` for profile fields. For the raw token — to call your own backend — take it from the auth service, send it as `Authorization: Bearer <token>`, and verify it server-side with `@nebulr-group/bridge-nestjs` or `@nebulr-group/bridge-express`.

> **Never make an authorization decision on the client alone.** Hiding a control is UX. The check that matters happens on the server against the verified token.

## Common mistakes

- **Hand-rolling a password form** instead of `<bridge-login-form>` — loses magic link, passkeys, MFA and workspace selection, all configured server-side.
- **Forgetting to mark the login route public** — infinite redirect.
- **Setting `loginRoute` while expecting hosted login**, or the reverse.
- **Trusting auth state for authorization.** It says a session exists, not what it may do.
- **Expecting an NgModule.** These are standalone components; import them into `imports: []`.

## Configuring auth methods

Which methods appear (password, magic link, passkeys, SSO, MFA) is **app configuration, not code** — set over MCP (`update_app`, `enable_auth_methods`), the `bridge` CLI, or the dashboard. The login form reflects it automatically. Do not add inputs trying to force a method on; change the app config.

## Related guides

- `integration-prompt.md` — `provideBridge`, route guard
- `feature-flags-prompt.md` — gating on flags
- `team-prompt.md` — team management UI
