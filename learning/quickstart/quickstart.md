# Bridge Angular Quickstart Guide

This guide shows how to get started with The Bridge Angular plugin.

## Install the plugin

```bash
npm i @nebulr-group/bridge-angular
```

## Configuration

Initialize Bridge in `app.config.ts` using `provideBridge`. Pass your `appId` and a `routeConfig` that describes which routes are public.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(
      { appId: 'YOUR_APP_ID' },
      {
        rules: [
          { match: '/', public: true },
          { match: '/login', public: true },
          { match: /^\/auth\/oauth-callback$/, public: true },
        ],
        defaultAccess: 'protected',
      },
    ),
  ],
};
```

`provideBridge` runs via `APP_INITIALIZER` — it refreshes tokens, loads feature flags, and starts auto-refresh before the app renders. No component wrapper is needed.

## Add the route guard

Apply `bridgeAuthGuard` via `canActivateChild` on the root route so every child route is checked automatically.

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

## Handle the OAuth callback

Create a component for `/auth/oauth-callback`. It exchanges the code for tokens and redirects to your app.

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
        await this.router.navigate(['/']);
      } catch {
        await this.router.navigate(['/']);
      }
    } else {
      await this.router.navigate(['/']);
    }
  }
}
```

## Add a login button

The simplest way to add login functionality is to use the pre-built `LoginComponent`:

```ts
import { LoginComponent } from '@nebulr-group/bridge-angular';

@Component({
  imports: [LoginComponent],
  template: `<bridge-login />`,
})
export class NavbarComponent {}
```

Or call `AuthService.login()` directly:

```ts
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  template: `<button (click)="login()">Sign In</button>`,
})
export class LoginButtonComponent {
  constructor(private authService: AuthService) {}
  login() { this.authService.login(); }
}
```

## Wrap-up

You now have a complete authentication flow with Bridge in your Angular application. Click the login button, sign up with a new account, and try navigating to a protected route.

For more detailed examples see the [examples documentation](../examples/examples.md).
