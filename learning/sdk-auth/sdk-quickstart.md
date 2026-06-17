# SDK Auth Quickstart

Render authentication UI directly inside your Angular app — no redirect to the Bridge hosted auth pages.

## Prerequisites

- The hosted-quickstart integration steps are complete (`provideBridge(...)` wired in `app.config.ts`).
- The Bridge app has **`tenantSelfSignup: true`** enabled (required for the signup flow).
- Enable the auth methods you want (Password, Magic Link, Passkeys, SSO providers) in the Bridge admin UI.
- The plugin ships structural CSS — import it once in your global stylesheet (`src/styles.css`):

  ```css
  @import '@nebulr-group/bridge-angular/styles.css';
  ```

## Install

```bash
npm install @nebulr-group/bridge-angular @nebulr-group/bridge-auth-core
```

(bridge-angular uses npm — match the Angular community's package manager.)

## Pages

These are plain standalone Angular components registered with your router. Keep the
paths identical so the public auth flow links line up. Every component rides the
adopted auth-core `BridgeAuth` via the injectable `AuthService` — no extra wiring needed.

### `/auth/login`

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-login',
  standalone: true,
  imports: [LoginFormComponent],
  template: `
    <bridge-login-form heading="Sign in" (login)="router.navigateByUrl('/')" />
  `,
})
export class SdkLoginComponent {
  protected readonly router = inject(Router);
}
```

`<bridge-login-form>` handles MFA, MFA setup, tenant selection, and the magic-link
callback automatically. It reads the anonymous app config and only shows enabled auth
methods.

### `/auth/signup`

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-signup',
  standalone: true,
  imports: [SignupFormComponent],
  template: `
    <bridge-signup-form (signup)="router.navigateByUrl('/auth/login')" />
  `,
})
export class SdkSignupComponent {
  protected readonly router = inject(Router);
}
```

### Magic link / forgot password / set password / passkey setup

| Route | Selector |
|---|---|
| `/auth/magic-link` | `<bridge-magic-link>` |
| `/auth/forgot-password` | `<bridge-forgot-password>` |
| `/auth/set-password/:token` | `<bridge-forgot-password [token]="token">` |
| `/auth/setup-passkey/:token` | `<bridge-passkey-setup [token]="token">` |

For the token routes, read the param with `ActivatedRoute`:

```ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-set-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `<bridge-forgot-password [token]="token" />`,
})
export class SdkSetPasswordComponent {
  protected readonly token =
    inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
}
```

### Register the routes

The SDK auth pages are **public** — register them outside the guarded children group,
and add matching `public: true` rules to your `RouteGuardConfig` (the route guard
defaults to `protected`):

```ts
// app.routes.ts
export const routes: Routes = [
  { path: 'auth/login', component: SdkLoginComponent },
  { path: 'auth/signup', component: SdkSignupComponent },
  { path: 'auth/magic-link', component: SdkMagicLinkComponent },
  { path: 'auth/forgot-password', component: SdkForgotPasswordComponent },
  { path: 'auth/set-password/:token', component: SdkSetPasswordComponent },
  { path: 'auth/setup-passkey/:token', component: SdkSetupPasskeyComponent },
  // ...your guarded routes...
];
```

```ts
// app.config.ts — RouteGuardConfig
const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/auth/login', public: true },
    { match: '/auth/signup', public: true },
    { match: '/auth/magic-link', public: true },
    { match: '/auth/forgot-password', public: true },
    { match: /^\/auth\/set-password($|\/)/, public: true },
    { match: /^\/auth\/setup-passkey($|\/)/, public: true },
  ],
  defaultAccess: 'protected',
};
```

## App config

The plugin reads the anonymous app config (called on mount) to know:
- Which SSO providers are enabled.
- Whether passwords / magic links / passkeys are available.
- Whether signup is allowed.

Toggles in the Bridge admin UI propagate to `<bridge-login-form>` automatically.

## Environment variables

bridge-angular reads the app id from a `NG_APP_`-prefixed env var:

```bash
NG_APP_BRIDGE_APP_ID=your-app-id
```

## Customizing

Override inputs on `<bridge-login-form>`:

```html
<bridge-login-form
  [showSignupLink]="false"
  [showMagicLink]="false"
  [showPasskeys]="true"
  [ssoConnections]="[{ id: 'google', type: 'google', name: 'Google' }]"
  forgotPasswordHref="/help/reset-password"
/>
```

## Outputs

Every sdk-auth component exposes Angular outputs for the key lifecycle events
(`(login)`, `(signup)`, `(verified)`, `(complete)`, `(error)`, etc.) so you can hook
navigation, toasts, or analytics. The internal step machines (forgot-password,
MFA challenge/setup) are handled for you.

## See also

- [Auth state and signals](../auth/auth.md)
- [Payments](../payments/payments.md)
