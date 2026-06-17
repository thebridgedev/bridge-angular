# Authentication

bridge-angular uses Bridge's **hosted auth** (redirect) flow, powered by auth-core's `BridgeAuth`. Users are sent to the Bridge-hosted login page, sign in, and are redirected back to your app's OAuth callback route, where the SDK exchanges the code for tokens. `BridgeAuth` owns token storage (localStorage) and background refresh.

> Configuration uses the env prefix `NG_APP_` (e.g. `NG_APP_BRIDGE_APP_ID`, `NG_APP_BRIDGE_API_BASE_URL`).

### Route protection

Pass a `RouteGuardConfig` as the second argument to `provideBridge()` in `app.config.ts`, and apply `bridgeAuthGuard()` via `canActivateChild` on the parent route.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  loginRoute: '/login',
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/auth/*', public: true },
    { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(bridgeConfig, routeConfig),
  ],
};
```

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

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

How it works:
- **`defaultAccess`** — sets whether unmatched routes are `'public'` or `'protected'`.
- **`rules`** — marks individual paths as public and/or gates them behind feature flags (FF 2.0 `bridge.evaluate(...)`).
- Unauthenticated users hitting a protected route are redirected to the hosted Bridge login page.

### The OAuth callback route

Create an empty callback route that exchanges the `code` for tokens via `AuthService.handleCallback()`. The redirect preserves the `?payment=` query param so post-checkout pages can show their result.

```ts
// src/app/pages/oauth-callback/oauth-callback.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  template: `<p>Signing you in…</p>`,
})
export class OAuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      await this.auth.handleCallback(code);
      const payment = this.route.snapshot.queryParamMap.get('payment');
      await this.router.navigate(['/'], { queryParams: payment ? { payment } : {} });
    } else {
      await this.router.navigate(['/']);
    }
  }
}
```

### Login & logout

Use the drop-in `<bridge-login>` button, or call `AuthService.login()` / `.logout()` directly:

```ts
import { Component } from '@angular/core';
import { AuthService, LoginComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [LoginComponent],
  template: `
    @if (isAuthenticated()) {
      <button (click)="logout()">Log out</button>
    } @else {
      <bridge-login />
    }
  `,
})
export class NavComponent {
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  constructor(private auth: AuthService) {}
  logout() { void this.auth.logout(); }
}
```

`login()` redirects to the hosted Bridge login page; `logout()` clears the local session and redirects to the hosted logout endpoint.

### Checking auth status

`AuthService` exposes Angular signals for auth state:

```ts
const isAuthenticated = this.auth.isAuthenticated; // Signal<boolean>
const isLoading = this.auth.isLoading;             // Signal<boolean>
const authError = this.auth.error;                 // Signal<string | null>
```

```html
@if (isLoading()) {
  <p>Loading…</p>
} @else if (isAuthenticated()) {
  <p>You are logged in!</p>
} @else {
  <p>Please log in to continue.</p>
}
```

### Getting the user profile

Access the current user's profile via the `profile` signal on `AuthService` (or `ProfileService.profile`):

```ts
const profile = this.auth.profile; // Signal<Profile | null | undefined>
```

```html
@if (profile(); as p) {
  <h2>{{ p.fullName }}</h2>
  <p>{{ p.email }}</p>
  @if (p.tenant) {
    <p>Tenant: {{ p.tenant.name }}</p>
  }
} @else if (profile() === undefined) {
  <p>Loading profile…</p>
} @else {
  <p>Not logged in</p>
}
```

The profile signal is `undefined` while loading, `null` when not authenticated, and a `Profile` object when authenticated. `BridgeAuth` populates it (and emits `auth:profile`) — no manual sync needed.

`ProfileService.getProfileAsync()` awaits `waitForBridge()` first, so it's safe to call before bootstrap completes.

A live snapshot of the signed-in user plus workspace and subscription state is also available on `BridgeService` (`bridge.user()`, `bridge.tenant.*`), kept current over the live channel.

### `<bridge-profile-name>`

A drop-in component that renders the user's display name (full name, or email fallback), or nothing when not authenticated:

```ts
import { ProfileNameComponent } from '@nebulr-group/bridge-angular';
```

```html
<bridge-profile-name />
<!-- renders: "John Doe" or "john@example.com" or nothing -->
```

Outputs a `<span>` with a `data-bridge-profile-name` attribute for styling. Accepts `className` and `style` inputs.

### Token refresh

Bridge automatically refreshes tokens before they expire — no manual intervention is needed. `AuthService.tokens()` always holds the current valid token set. On realtime reconnect the runtime proactively refreshes to pick up any server-side claims change.
