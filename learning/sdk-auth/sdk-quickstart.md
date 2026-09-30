# SDK auth quickstart

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted auth quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Angular plugin using in-app SDK auth components, with no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-angular
```

## 2. Configuration (`app.config.ts`)

Initialize Bridge with `provideBridge` in your application config. `loginRoute` switches sign-in to the in-app pages; `bridgeInterceptor` makes your own API calls carry the user's token.

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { bridgeInterceptor, provideBridge } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([bridgeInterceptor])),
    provideBridge({
      appId: environment.bridgeAppId,
      loginRoute: '/auth/login',
      // Unset means production. Set it for a stage/local app — an app id from
      // another environment against production fails with "app not found".
      apiBaseUrl: environment.bridgeApiBaseUrl,
    }),
  ],
};
```

Key points:
- **Configuration is code.** Angular has no environment-variable convention, so values come from your own `environment.ts`. Each option resolves as *explicit option > default*; an empty string counts as unset; a missing `appId` throws, naming the option. `hostedUrl` follows `apiBaseUrl` on Bridge's own domains.
- **`loginRoute`**: where the route guard sends an unauthenticated visitor. Unset means Bridge's hosted login.
- **Every route is protected by default**; the sign-in pages below are public by construction.
- **`provideBridge` runs via `APP_INITIALIZER`**: it initializes auth, feature flags, and the live channel before the app renders. Bridge requires client-side rendering.

## 3. Register every sign-in page (`app.routes.ts`)

One spread serves login, signup, the OAuth callback, set password (where signup verification and password-reset emails land), forgot password, magic link, passkey setup and workspace selection:

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  ...bridgeAuthRoutes(),
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      // ...your app's routes...
    ],
  },
];
```

`bridgeAuthRoutes()` returns a plain lazy `Routes` array. Any address under `/auth` that is not one of its pages falls through to your own `**` route. Auth method visibility (magic link, passkeys, SSO) comes from your app's settings in the Control Center at runtime, so turning magic links on needs no code.

After sign-in the pages go to the `?redirectUri=` deep link the guard attached, else `/` (`bridgeAuthRoutes({ redirectTo: '/dashboard' })` changes that).

## 4. Customise, only as far as you need

| Rung | How |
|---|---|
| 1 — tokens | `--bridge-*` CSS variables ([theming](../theming/theming.md)) |
| 2 — frame and heading | `bridgeAuthRoutes({ frame: AuthLayoutComponent, heading: (page) => page === 'login' ? 'Welcome back' : null })` — the frame is a layout component with its own `<router-outlet>` |
| 3 — take over one page | `bridgeAuthRoutes({ overrides: { login: { component: MyLoginComponent } } })`, or your own `{ path: 'auth/login', … }` placed before the spread |
| 4 — headless | build on `<bridge-login-form>`, `<bridge-signup-form>` … or `AuthService.getBridgeAuth()` |

A login page you own (rung 3) renders `<bridge-login-form>` and navigates itself:

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginFormComponent, readReturnTo } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LoginFormComponent],
  template: `<bridge-login-form heading="Sign in to Acme" (login)="done()" />`,
})
export class MyLoginComponent {
  private readonly router = inject(Router);
  done() {
    this.router.navigateByUrl(readReturnTo(location.href) ?? '/');
  }
}
```

`<bridge-login-form>` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and workspace selection. **Outputs:** `(login)`, `(error)`.

## 5. Signup

`/auth/signup` is already served. After a successful signup the user receives a verification email whose link lands on `/auth/set-password/:token`, which is served too.

## 6. Styles

> **Framework note:** the styles are not injected automatically. Import them
> once in your global stylesheet (`src/styles.css`):
> `@import '@nebulr-group/bridge-angular/styles.css';`

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The object you pass to `provideBridge` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID. Missing, Bridge throws and names it |
| `loginRoute` | (unset = hosted) | In-app login route, e.g. `'/auth/login'` |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `apiBaseUrl` | `https://api.thebridge.dev` | Bridge API address, for a stage/local app |
| `hostedUrl` | follows `apiBaseUrl` | Hosted sign-in pages, for a local/self-hosted Bridge |
| `debug` | `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list (billing routes, the upgrade dialog) and [How Bridge works](../mechanisms.md) for the whole integration on one page.

## Next steps

- **More auth UI components**: [MFA](/auth/ui/mfa/), [passkeys](/auth/ui/passkeys/), [magic link](/auth/ui/magic-link/), [SSO login button](/auth/ui/google-sso/), [switching workspaces](/auth/ui/switching-workspaces/), and [user & team management](/auth/ui/team-management/).
- **The user token**: [logging in and logging out](/auth/user-token/logging-in-and-out/), [getting the token](/auth/user-token/getting-the-token/), and [auth states](/auth/user-token/auth-states/).
- **Route protection**: [frontend route guards](/auth/securing/route-guards/), or browse the full [Auth](/auth/) section.
- **Feature flags and billing**: [how flags work](/feature-flags/how-it-works/) and [how billing works](/billing/how-it-works/).
