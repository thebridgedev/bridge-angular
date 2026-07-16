# Configuration Reference

### BridgeConfig type

The config object you pass to `provideBridge`:

```typescript
interface BridgeConfig {
  /** Your Bridge application ID (required) */
  appId: string;

  /** Where the login flow redirects back to.
   *  @default `${window.location.origin}/auth/oauth-callback` */
  callbackUrl?: string;

  /** Base URL for the Bridge auth services (includes the /auth path).
   *  @default 'https://api.thebridge.dev/auth' */
  authBaseUrl?: string;

  /** Base URL for the Bridge API. Used by Feature Flags 2.0 and the realtime
   *  runtime (live updates channel).
   *  @default 'https://api.thebridge.dev' */
  apiBaseUrl?: string;

  /** Base URL for the Bridge cloud-views service (plan selection, payments).
   *  @default 'https://api.thebridge.dev/cloud-views' */
  cloudViewsUrl?: string;

  /** Route to redirect to after login. @default '/' */
  defaultRedirectRoute?: string;

  /** Route to redirect to when authentication fails. @default '/login' */
  loginRoute?: string;

  /** Enable debug logging. @default false */
  debug?: boolean;

  /** Billing paywall configuration. When set, Bridge redirects an authenticated
   *  tenant that hasn't selected a plan to `paywallRoute` before a protected
   *  route renders. */
  billing?: {
    /** Route to redirect to when the tenant has no plan selected. */
    paywallRoute?: string;
    /** Route to redirect to when a Stripe checkout confirmation fails.
     *  @default '/payment-error' */
    paymentErrorRoute?: string;
  };
}
```

### provideBridge()

Register it in your `app.config.ts` providers. It wires an `APP_INITIALIZER` that
initializes config, mounts the realtime runtime, and initializes Feature Flags 2.0
once during app bootstrap, the Angular equivalent of bridge-svelte's
`<BridgeBootstrap />`.

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideBridge,
  type BridgeConfig,
  type RouteGuardConfig,
} from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  loginRoute: '/login',
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
    provideBridge(bridgeConfig, routeConfig),
  ],
};
```

Signature:

```typescript
provideBridge(
  config: BridgeConfig | string,   // config object, or just the appId as a string
  routeConfig?: RouteGuardConfig,  // default: { rules: [], defaultAccess: 'protected' }
): EnvironmentProviders
```

Bootstrap is idempotent: the runtime and flags init only run once.

### RouteGuardConfig

Declares which routes are public, protected, or flag-gated. Apply the guard via
`canActivateChild: [bridgeAuthGuard()]` on a parent route:

```typescript
interface RouteGuardConfig {
  rules: RouteRule[];
  /** Access for routes no rule matches. @default 'protected' */
  defaultAccess?: 'public' | 'protected';
}

interface RouteRule {
  /** Path to match: exact string, wildcard string, or RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
  /** Require feature flag(s): a key, { any: [...] }, or { all: [...] }. */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Where to send users who fail the featureFlag requirement. */
  redirectTo?: string;
}
```

Feature-flag requirements are evaluated with **Feature Flags 2.0**: the guard
reads the hydrated flag cache (no per-route network round trip).

### Passing values via .env

Keep environment-specific values in a `.env` file instead of hardcoding them, and
read them with `import.meta.env`. The `NG_APP_` prefix is required for values to
reach the browser; the SDK does not read environment variables automatically.

```env
NG_APP_BRIDGE_APP_ID=your-app-id-here
NG_APP_BRIDGE_API_BASE_URL=https://api.thebridge.dev
NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```typescript
const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  apiBaseUrl: import.meta.env.NG_APP_BRIDGE_API_BASE_URL,
  defaultRedirectRoute: import.meta.env.NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
  debug: !environment.production,
};
```

> Angular CLI reads `NG_APP_`-prefixed variables when you use a `.env` loader such
> as [`@ngx-env/builder`](https://github.com/chihab/dotenv-run). Without one, set
> the values directly in your `src/environments/environment*.ts` files, which is
> the pattern the bundled demo uses.

### Reading the resolved config

Read the active config at runtime via `BridgeConfigService`:

```typescript
import { Component, inject } from '@angular/core';
import { BridgeConfigService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-config-status',
  standalone: true,
  template: `
    @if (configService.config(); as config) {
      <p>App ID: {{ config.appId }}</p>
      <p>API Base: {{ config.apiBaseUrl }}</p>
    }
  `,
})
export class ConfigStatusComponent {
  protected readonly configService = inject(BridgeConfigService);
}
```

`configService.config` and `configService.configReady` are signals; read them
directly in templates or inside `computed()` / `effect()`.
