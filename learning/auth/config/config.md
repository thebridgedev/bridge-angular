# Configurations

The `BridgeConfig` object you pass to `provideBridge()` controls how Bridge wires up auth, routing, and billing in your app — see [all config options](#all-config-options) for the full list.

## Passing configs to Bridge

Call `provideBridge()` from your `app.config.ts` providers, passing it a `BridgeConfig` object:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
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
    provideBridge(bridgeConfig, routeConfig),
  ],
};
```

Signature:

```ts
provideBridge(
  config: BridgeConfig | string,   // config object, or just the appId as a string
  routeConfig?: RouteGuardConfig,  // default: { rules: [], defaultAccess: 'protected' }
): EnvironmentProviders
```

`provideBridge()` registers an `APP_INITIALIZER` that initializes config, constructs the auth-core `BridgeAuth` singleton, mounts the realtime runtime, and initializes Feature Flags 2.0 — all once, in order, during app bootstrap. Bootstrap is idempotent — the runtime and flags init only run once even if `provideBridge()` ends up in the provider tree twice.

`routeConfig` is optional — see [Route guards](../securing/route-guards.md) for the full `RouteGuardConfig` shape and how `bridgeAuthGuard()` uses it.

## Reading the resolved config

Read the active config at runtime via `BridgeConfigService`:

```ts
import { Component, inject } from '@angular/core';
import { BridgeConfigService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-config-status',
  standalone: true,
  template: `
    @if (configService.config(); as config) {
      <p>App ID: {{ config.appId }}</p>
      <p>Login route: {{ config.loginRoute }}</p>
    }
  `,
})
export class ConfigStatusComponent {
  protected readonly configService = inject(BridgeConfigService);
}
```

`configService.config` and `configService.configReady` are signals — read them directly in templates or inside `computed()` / `effect()`.

## Callback URL

`callbackUrl` is the URL Bridge calls back to once a login completes. If you omit it, Bridge falls back to `${window.location.origin}/auth/oauth-callback`.

Passing a specific `callbackUrl` lets you send different parts of your app through different post-login destinations — for example, an admin section and a regular user section of the same app, or entirely separate apps sharing one Bridge project.

Whatever you pass here must already be registered as an allowed redirect URI in Control Center — see [Configs managed in Control Center](#configs-managed-in-control-center) — Bridge only redirects to callback URLs it's been told about.

```ts
const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  callbackUrl: `${window.location.origin}/admin/oauth-callback`,
};
```

## All config options

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | — (required) | Your Bridge application ID |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login — see [Callback URL](#callback-url) |
| `authBaseUrl` | `string` | `'https://api.thebridge.dev/auth'` | Base URL for the Bridge auth services |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Base URL for the Bridge API — used by the Feature Flags 2.0 SDK and the realtime runtime (live updates channel). Distinct from `authBaseUrl` and `cloudViewsUrl` |
| `cloudViewsUrl` | `string` | `'https://api.thebridge.dev/cloud-views'` | Base URL for the Bridge cloud-views service (plan selection, payments, feature flags) |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | `'/login'` | Route to redirect to when authentication fails |
| `billing.paywallRoute` | `string` | — | Route to redirect to when the tenant has no plan selected |
| `billing.paymentErrorRoute` | `string` | `'/payment-error'` | Route to redirect to when a Stripe checkout confirmation fails |
| `debug` | `boolean` | `false` | Enable debug logging |

There is no client-side `storage` adapter option in `@nebulr-group/bridge-angular` — the auth-core `BridgeAuth` singleton owns token storage (`localStorage`) internally.

## Passing values via .env

> **Tip:** this is just a best practice, not a requirement. Keep environment-specific values in a `.env` file instead of hardcoding them, and read them with `import.meta.env` when you build the config. The `NG_APP_` prefix is required for values to reach the browser; the SDK does not read environment variables automatically.

```env
NG_APP_BRIDGE_APP_ID=your-app-id-here
NG_APP_BRIDGE_API_BASE_URL=https://api.thebridge.dev
NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```ts
const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  apiBaseUrl: import.meta.env.NG_APP_BRIDGE_API_BASE_URL,
  defaultRedirectRoute: import.meta.env.NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
  debug: !environment.production,
};
```

> Angular CLI reads `NG_APP_`-prefixed variables when you use a `.env` loader such as [`@ngx-env/builder`](https://github.com/chihab/dotenv-run). Without one, set the values directly in your `src/environments/environment*.ts` files instead.

## Configs managed in Control Center

Some settings aren't passed in code at all — they're set once per app, and Bridge enforces them server-side:

| Setting | What it does |
|---------|---------------|
| Redirect URIs | The allowlist of callback URLs Bridge is allowed to redirect to. Any `callbackUrl` you pass to `provideBridge()` must already be on this list. |
| Allowed origins | The CORS allowlist — origins permitted to call the Bridge API directly from the browser. |
| Default callback URL | Used whenever your app doesn't pass a `callbackUrl` in code — see [Callback URL](#callback-url). |

- **CLI:**

  ```bash
  bridge app update \
    --redirect-uris "https://app.example.com/oauth-callback,https://admin.example.com/oauth-callback" \
    --allowed-origins "https://app.example.com,https://admin.example.com" \
    --default-callback-uri "https://app.example.com/oauth-callback"
  ```

- **Control Center:** the same settings, managed from your app's settings.
- **MCP:** not yet available — coming soon.
