# Hosted auth quickstart

The fastest way to add authentication to your Angular app. Bridge handles the entire login UI on a hosted page, so you don't need to build any auth forms.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-angular
```

## 2. Configuration (`app.config.ts`)

Initialize Bridge with `provideBridge` in your application config. For hosted auth, you only need `appId` and a `routeConfig`. No `loginRoute` is needed because Bridge redirects unauthenticated users to the hosted login page automatically.

```typescript
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
- **No `loginRoute`**: without it, Bridge redirects to the hosted login page instead of an in-app route.
- **`defaultAccess: 'protected'`**: all routes require auth unless explicitly marked `public`.
- **`provideBridge` runs via `APP_INITIALIZER`**: it initializes auth, feature flags, and the live channel before the app renders, so no bootstrap component or ready-gating is needed. Bridge requires client-side rendering (Angular apps are client-rendered by default).

## 3. Add the route guard

Apply `bridgeAuthGuard` via `canActivateChild` on the root route so every child route is checked automatically.

```typescript
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

## 4. Add the callback route

Angular requires a route and component to exist so it doesn't return a 404 when Bridge redirects back to your app. The component exchanges the code for tokens and redirects into your app:

```typescript
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

## 5. That's it: no login page needed

With hosted auth, Bridge automatically redirects unauthenticated users to the Bridge hosted login UI. When the user completes authentication on the hosted page, they are redirected back to the callback route you created in step 4.

You do not need to create any login or signup pages.

## 6. Configuration

The `config` object you pass to `provideBridge` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID |
| `callbackUrl` | `<origin>/auth/oauth-callback` | Where the hosted login page redirects back to |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `loginRoute` | (unset) | Declared but not used by the route guard yet; unauthenticated users always go to the hosted page. See the [config reference](/auth/config/#login-route) |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `cloudViewsUrl` | `https://api.thebridge.dev/cloud-views` | Bridge cloud-views base URL (dev override) |
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
  defaultRedirectRoute: import.meta.env.NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
};
```

## Next steps

- **In-app auth forms**: if you want to embed login/signup forms directly in your app instead of using the hosted page, see the [SDK auth quickstart](../sdk-auth/sdk-quickstart.md).
- **Theming**: customize the look of Bridge components with CSS variables and overrides. See [Theming & Styles](../theming/theming.md).
- **Going further**: add [feature flags](/feature-flags/how-it-works/), [billing and subscriptions](/billing/how-it-works/), or explore the full [Auth](/auth/) section.
