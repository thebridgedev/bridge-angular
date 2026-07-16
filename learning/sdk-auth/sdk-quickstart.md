# SDK auth quickstart

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted auth quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Angular plugin using in-app SDK auth components, with no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-angular
```

## 2. Configuration (`app.config.ts`)

Initialize Bridge with `provideBridge` in your application config. The `BridgeConfig` object tells Bridge your `appId` and where your login page lives. The `routeConfig` defines which routes are public and which require authentication.

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: /^\/auth($|\/)/, public: true },
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

Key points:
- **`loginRoute`**: tells Bridge where to redirect unauthenticated users (your in-app login page).
- **`defaultAccess: 'protected'`**: all routes require auth unless explicitly marked `public`.
- **`provideBridge` runs via `APP_INITIALIZER`**: it initializes auth, feature flags, and the live channel before the app renders, so no bootstrap component or ready-gating is needed. Bridge requires client-side rendering (Angular apps are client-rendered by default).

## 3. Register the routes and guard

Register the auth pages with your router and apply `bridgeAuthGuard` via `canActivateChild` on the routes that should be protected. The auth pages themselves are covered by the `public: true` rule above.

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';
import { SdkLoginComponent } from './pages/auth/login.component';
import { SdkSignupComponent } from './pages/auth/signup.component';

export const routes: Routes = [
  { path: 'auth/login', component: SdkLoginComponent },
  { path: 'auth/signup', component: SdkSignupComponent },
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      // ...your app's routes...
    ],
  },
];
```

## 4. Create a login page

Drop the `<bridge-login-form>` component onto a page that matches your `loginRoute`.

```typescript
// src/app/pages/auth/login.component.ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-login',
  standalone: true,
  imports: [LoginFormComponent],
  template: `
    <div class="login-page">
      <bridge-login-form [showSignupLink]="true" (login)="router.navigateByUrl('/')" />
    </div>
  `,
  // Optional: center the form on the page. Not required for the component to work.
  styles: `
    .login-page {
      display: flex;
      justify-content: center;
      padding: 3rem 1rem;
    }
  `,
})
export class SdkLoginComponent {
  protected readonly router = inject(Router);
}
```

Wire the `(login)` output to navigate into your app after a successful sign-in. Auth method visibility (magic link, passkeys, SSO) is derived from your app's configuration in the Control Center (your admin dashboard at app.thebridge.dev).

`<bridge-login-form>` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and workspace selection (a workspace is called a *tenant* in the API) all render within the same component automatically when needed.

**Outputs:** `(login)` (fires after successful auth, useful for analytics or navigation), `(error)` (fires on auth failure).

## 5. Create a signup page

```typescript
// src/app/pages/auth/signup.component.ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-signup',
  standalone: true,
  imports: [SignupFormComponent],
  template: `
    <div class="signup-page">
      <bridge-signup-form [showLoginLink]="true" loginHref="/auth/login" />
    </div>
  `,
  // Optional: center the form on the page.
  styles: `
    .signup-page {
      display: flex;
      justify-content: center;
      padding: 3rem 1rem;
    }
  `,
})
export class SdkSignupComponent {
  protected readonly router = inject(Router);
}
```

After a successful signup the user receives a verification email. Once verified, they can sign in.

**Outputs:** `(signup)` (fires after successful signup), `(error)` (fires on failure).

## 6. Styles

> **Framework note:** the styles are not injected automatically. Import them
> once in your global stylesheet (`src/styles.css`):
> `@import '@nebulr-group/bridge-angular/styles.css';`

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The `config` object you pass to `provideBridge` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID |
| `loginRoute` | (unset) | Declared but not used by the route guard yet; unauthenticated users go to Bridge's hosted login page. See the [config reference](/auth/config/#login-route) |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `debug` | `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list (base URLs, billing routes).

Rather than hardcoding environment-specific values, keep them in env config and read them with the `NG_APP_` prefix (via `@ngx-env/builder` or your environment files), so values reach the browser bundle:

```env
NG_APP_BRIDGE_APP_ID=your-app-id-here
NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
  defaultRedirectRoute: import.meta.env.NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
};
```

## Next steps

- **More auth UI components**: [MFA](/auth/ui/mfa/), [passkeys](/auth/ui/passkeys/), [magic link](/auth/ui/magic-link/), [SSO login button](/auth/ui/google-sso/), [switching workspaces](/auth/ui/switching-workspaces/), and [user & team management](/auth/ui/team-management/).
- **The user token**: [logging in and logging out](/auth/user-token/logging-in-and-out/), [getting the token](/auth/user-token/getting-the-token/), and [auth states](/auth/user-token/auth-states/).
- **Route protection**: [frontend route guards](/auth/securing/route-guards/), or browse the full [Auth](/auth/) section.
- **Feature flags and billing**: [how flags work](/feature-flags/how-it-works/) and [how billing works](/billing/how-it-works/).
