import { Tabs, TabItem } from '@astrojs/starlight/components';

# Route guards

Pass `routeConfig` as the second argument to `provideBridge` in `app.config.ts`, then apply `bridgeAuthGuard()` via `canActivateChild` in `app.routes.ts`; it handles navigation guards automatically.

<Tabs>
<TabItem label="app.config.ts">

```ts
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
    { match: new RegExp('^/auth($|/)'), public: true },
    { match: '/beta/*', featureFlag: 'beta_feature', redirectTo: '/' },
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

</TabItem>
<TabItem label="app.routes.ts">

```ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard } from '@nebulr-group/bridge-angular';

export const routes: Routes = [
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [
      { path: '', component: HomeComponent },
      { path: 'auth/oauth-callback', component: OAuthCallbackComponent },
      { path: 'beta', component: BetaComponent },
      { path: 'protected', component: ProtectedComponent },
    ],
  },
];
```

</TabItem>
</Tabs>

> **Framework note:** `bridgeAuthGuard()` returns a standard Angular `CanActivateFn`. Applying it via `canActivateChild` on a parent route checks every child route automatically, so you don't add it to each route individually. It reads the rules from the `routeConfig` you passed to `provideBridge`.

**How it works:**

| Option | What it does |
|--------|--------------|
| `defaultAccess` | Sets whether unmatched routes are `'public'` or `'protected'`. |
| `rules` | Marks individual paths as public and/or gates them behind feature flags. |
| Unauthenticated access | Unauthenticated users hitting a protected route are redirected to Bridge's hosted login page. |

Redirects are handled automatically by `bridgeAuthGuard()`. For the full `RouteRule` shape, and the billing paywall redirect driven by `billing.paywallRoute`, see the [config reference](/auth/config/#route-guard-config).

## Returning to the page they asked for

Someone who follows a link into a protected page — an emailed document link, a
bookmark, a shared URL — lands on that page after signing in, not on your
default route. This is on by default; you do not configure anything to get it.

How the target travels depends on which login you use:

| Mode | Mechanism | Your job |
|------|-----------|----------|
| **Hosted** (no `loginRoute`) | Held in `sessionStorage` across the OAuth round-trip | Read it in your OAuth callback — below |
| **SDK** (you set `loginRoute`) | `?redirectUri=` on your own login route | Read it after login — below |

### SDK mode: read it on your login page

Your login page owns the post-login navigation, so it has to read the target.
Use `readReturnTo` — it validates the value for you:

```ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoginFormComponent, readReturnTo } from '@nebulr-group/bridge-angular';

@Component({
  standalone: true,
  imports: [LoginFormComponent],
  template: `<bridge-login-form (login)="onLogin()" />`,
})
export class LoginPageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  onLogin(): void {
    // Falls back to your own default when there is no target, or when the one
    // supplied is not safe to navigate to.
    const target = readReturnTo(this.route.snapshot.queryParamMap.get('redirectUri'));
    this.router.navigateByUrl(target ?? '/dashboard');
  }
}
```

### Hosted mode: read it in your OAuth callback

The guard stashes the target before it leaves for the hosted portal. Your
callback component takes it back:

```ts
import { takeReturnTo } from '@nebulr-group/bridge-angular';

await this.authService.handleCallback(code);
// One-shot, re-validated, and null when nothing was stashed — so an app with
// no deep linking behaves exactly as it did before.
this.router.navigateByUrl(takeReturnTo() ?? '/');
```

:::caution[Do not read the parameter yourself]
`?redirectUri=` arrives in the URL, so **whoever wrote the link controls it**.
Navigating to it unchecked is an open redirect: a link carrying
`?redirectUri=https://example.invalid` would bounce your users off-site, still
looking like it came from you. Phishing works well from there.

`readReturnTo` rejects anything that is not a same-origin path — absolute URLs,
protocol-relative `//host`, backslash variants, and control characters — and
returns `null` instead, which is why the `??` fallback above is all you need.
If you must handle the value yourself, run it through `sanitizeReturnTo` first.
:::

### Keeping auth routes out of it

Your `loginRoute` is excluded automatically, so a bounce through the login page
never comes back pointing at itself. Public routes are never used as a return
target either. Exclude the rest of your auth flow too:

```ts
const routeConfig: RouteGuardConfig = {
  rules: [ /* … */ ],
  defaultAccess: 'protected',
  returnTo: { exclude: [new RegExp('^/auth($|/)')] },
};
```

### Turning it off

To send every login to the same place regardless of where the visitor was
heading:

```ts
returnTo: { enabled: false }
```
