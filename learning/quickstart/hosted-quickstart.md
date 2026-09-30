# Hosted auth quickstart

The fastest way to add authentication to your Angular app. Bridge handles the entire login UI on a hosted page, so you don't need to build any auth forms.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-angular
```

## 2. Configuration (`app.config.ts`)

Initialize Bridge with `provideBridge` in your application config. For hosted auth you only need `appId` (plus `apiBaseUrl` for a stage or local app). No `loginRoute`: without it, Bridge sends unauthenticated visitors to the hosted login page.

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge({
      appId: environment.bridgeAppId,
      // Unset means production. The hosted pages follow it on Bridge's
      // domains (api-stage.thebridge.dev → auth-stage.thebridge.dev).
      apiBaseUrl: environment.bridgeApiBaseUrl,
    }),
  ],
};
```

Key points:
- **Configuration is code**: Angular has no environment-variable convention, so values come from your own `environment.ts`. Each option resolves as *explicit option > default*; an empty string is unset; a missing `appId` throws, naming the option.
- **Every route is protected by default** (`defaultAccess: 'protected'`). Pass a second argument, `{ rules: [{ match: '/', public: true }] }`, to open routes.
- **`provideBridge` runs via `APP_INITIALIZER`**: auth, feature flags and the live channel are ready before the app renders. Bridge requires client-side rendering.

## 3. Routes: the guard and the callback page

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { bridgeAuthGuard, bridgeAuthRoutes } from '@nebulr-group/bridge-angular';
import { HomeComponent } from './pages/home/home.component';

export const routes: Routes = [
  ...bridgeAuthRoutes(),   // includes /auth/oauth-callback, where the hosted login returns
  {
    path: '',
    canActivateChild: [bridgeAuthGuard()],
    children: [{ path: '', component: HomeComponent }],
  },
];
```

`bridgeAuthRoutes()` serves `/auth/oauth-callback`: it exchanges the code, then lands on the page the visitor originally asked for (or `/`). It also confirms a returning Stripe checkout. In hosted mode its other pages point at the hosted login, so switching to in-app sign-in later is one config line (`loginRoute: '/auth/login'`).

## 4. That's it: no login page needed

With hosted auth, Bridge redirects unauthenticated users to the hosted login UI and back to `/auth/oauth-callback`.

## 5. Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID |
| `callbackUrl` | `<origin>/auth/oauth-callback` | Where the hosted login page redirects back to |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `loginRoute` | (unset = hosted) | Set `'/auth/login'` for in-app sign-in |
| `apiBaseUrl` | `https://api.thebridge.dev` | Bridge API address, for a stage/local app |
| `hostedUrl` | follows `apiBaseUrl` | Hosted pages, for a local/self-hosted Bridge |
| `debug` | `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list, and [How Bridge works](../mechanisms.md) for the whole integration on one page.

## Next steps

- **In-app auth forms**: if you want to embed login/signup forms directly in your app instead of using the hosted page, see the [SDK auth quickstart](../sdk-auth/sdk-quickstart.md).
- **Theming**: customize the look of Bridge components with CSS variables and overrides. See [Theming & Styles](../theming/theming.md).
- **Going further**: add [feature flags](/feature-flags/how-it-works/), [billing and subscriptions](/billing/how-it-works/), or explore the full [Auth](/auth/) section.
