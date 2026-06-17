# Bridge Angular — Hosted Auth Quickstart

The fastest way to add authentication to your Angular app. Bridge handles the entire login
UI on a hosted page — you don't need to build any auth forms.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-angular
```

## 2. Configuration (`app.config.ts`)

Initialize Bridge with `provideBridge`. For hosted auth you only need `appId` and a
`routeConfig` — no `loginRoute` is needed, because Bridge redirects unauthenticated users
to the hosted login page automatically.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
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
- **No `loginRoute`** — without it, Bridge redirects to the hosted login page instead of an
  in-app route.
- **`defaultAccess: 'protected'`** — all routes require auth unless explicitly marked
  `public`.
- `provideBridge` runs via `APP_INITIALIZER` — it refreshes tokens, loads feature flags, and
  starts auto-refresh before the app renders. No component wrapper is needed (Angular is
  client-rendered by default).

## 3. Add the route guard

Apply `bridgeAuthGuard` via `canActivateChild` on the root route so every child route is
checked automatically.

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';
import { HomeComponent } from './pages/home/home.component';
import { OAuthCallbackComponent } from './pages/oauth-callback/oauth-callback.component';
import { ProtectedComponent } from './pages/protected/protected.component';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
      { path: 'protected', component: ProtectedComponent },
    ],
  },
];
```

## 4. That's it — no login page needed

With hosted auth, Bridge automatically redirects unauthenticated users to the Bridge hosted
login UI. When the user completes authentication on the hosted page, they are redirected
back to your app's callback URL. You do not need to create any login or signup pages.

## 5. Add the callback route

Angular needs a route + component to exist so it doesn't 404 when Bridge redirects back.
The component exchanges the code for tokens and redirects into your app.

```ts
// src/app/pages/oauth-callback/oauth-callback.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  template: `
    <div style="text-align: center; padding: 2rem;">
      <h1>Signing you in…</h1>
      <p>You'll be redirected shortly.</p>
    </div>
  `,
})
export class OAuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      try {
        await this.authService.handleCallback(code);
      } catch {
        /* fall through to redirect */
      }
    }
    await this.router.navigate(['/']);
  }
}
```

## 6. Add a login (and logout) button

Use the pre-built `LoginComponent`:

```ts
import { LoginComponent } from '@nebulr-group/bridge-angular';

@Component({
  imports: [LoginComponent],
  template: `<bridge-login />`,
})
export class NavbarComponent {}
```

Or call `AuthService` directly:

```ts
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  template: `<button (click)="login()">Sign In</button>`,
})
export class LoginButtonComponent {
  constructor(private authService: AuthService) {}
  login() { this.authService.login(); }
  logout() { this.authService.logout(); }
}
```

## 7. Configuration reference

The `config` object you pass to `provideBridge` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge application ID |
| `callbackUrl` | `<origin>/auth/oauth-callback` | Where the hosted login page redirects back to |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `loginRoute` | — | In-app login route — leave unset for hosted auth (that's what triggers the hosted page) |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `cloudViewsUrl` | `https://api.thebridge.dev/cloud-views` | Bridge cloud-views base URL (dev override) |
| `debug` | `false` | Enable debug logging |

See the [Configuration Reference](../configuration/configuration.md) for the full list.

Rather than hardcoding environment-specific values, keep them in env config and read them
with the `NG_APP_` prefix (via `@ngx-env/builder` or your environment files), so values
reach the browser bundle:

```env
NG_APP_BRIDGE_APP_ID=your-app-id-here
NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```ts
const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  defaultRedirectRoute: import.meta.env.NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
};
```

## Next steps

- **In-app auth forms** — To embed login/signup forms directly in your app instead of using
  the hosted page, see the [SDK Auth Guide](../sdk-auth/sdk-quickstart.md).
- **Theming** — Customize the look of Bridge components with CSS variables and overrides.
  See [Theming & Styles](../theming/theming.md).
- **Feature flags, payments, team management** — See the [examples index](../examples/examples.md)
  for links to all feature guides.
