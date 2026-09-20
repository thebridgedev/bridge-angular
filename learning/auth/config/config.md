import { Tabs, TabItem } from '@astrojs/starlight/components';

# Configurations

The config object you pass to `provideBridge` controls how Bridge wires up auth, routing, and billing in your app. See [all config options](#all-config-options) for the full list.

## Passing configs to Bridge

Call `provideBridge()` from your `app.config.ts` providers, passing it a `BridgeConfig` object. The app ID comes from Control Center (your admin dashboard at app.thebridge.dev): open your app's settings and copy its ID into your `.env`.

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
    { match: new RegExp('^/auth($|/)'), public: true },
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

Signature:

```typescript
provideBridge(
  config: BridgeConfig | string,  // config object, or just the appId as a string
  routeConfig?: RouteGuardConfig, // default: { rules: [], defaultAccess: 'protected' }
): EnvironmentProviders
```

> **Framework note:** `provideBridge()` registers an `APP_INITIALIZER` that
> runs `BridgeBootstrapService` during app bootstrap: it initializes the
> config, constructs the auth-core `BridgeAuth` singleton, mounts the realtime
> runtime, and initializes feature flags, once, in order.

Bootstrap is idempotent: calling it again after it has completed is a no-op.

## Reading the resolved config

Read the active config at runtime via the `BridgeConfigService.config` signal:

```typescript
import { Component, inject } from '@angular/core';
import { BridgeConfigService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-config-status',
  standalone: true,
  template: `
    @if (configService.config(); as config) {
      <p>App ID: {{ config.appId }}</p>
      <p>Callback URL: {{ config.callbackUrl }}</p>
    }
  `,
})
export class ConfigStatusComponent {
  protected readonly configService = inject(BridgeConfigService);
}
```

## Callback URL

`callbackUrl` is the URL Bridge calls back to once a login completes. If you omit it, the SDK falls back to `${window.location.origin}/auth/oauth-callback`.

Passing a specific `callbackUrl` lets you send different parts of your app through different post-login destinations, for example an admin section and a regular user section of the same app, or entirely separate apps sharing one Bridge project.

Whatever you pass here must already be registered as an allowed redirect URI in Control Center (see [Configs managed in Control Center](#configs-managed-in-control-center)); Bridge only redirects to callback URLs it's been told about.

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  callbackUrl: `${window.location.origin}/admin/oauth-callback`,
};
```

## Base URLs

**`apiBaseUrl` is the one to set.** It is the only base URL the SDK actually reads, and every other Bridge URL is derived from it (auth endpoints resolve to `apiBaseUrl + '/auth'`).

- **`apiBaseUrl`** (default `https://api.thebridge.dev`): the base URL for the Bridge API — auth, feature flags and the realtime runtime (live updates channel) all derive from it.

> **Set this for any non-production app, and set it in `BridgeConfig`.** It defaults to production and the failure is silent: a stage or local app ID pointed at the production API does not exist there, so signup comes back `Not Found` with nothing in the console naming the cause. The SDK reads no environment variables of its own — reading `NG_APP_BRIDGE_API_BASE_URL` (or an `environment.*` value) and passing it as `apiBaseUrl` is your app's job.

> **`authBaseUrl` and `cloudViewsUrl` are not read.** They exist on the `BridgeConfig` type and carry defaults, but nothing in the SDK consumes them — `provideBridge()` forwards only `appId` and `apiBaseUrl` to the auth core, which derives its auth base URL from `apiBaseUrl`. Setting either one has no effect; point a self-hosted or dedicated environment at `apiBaseUrl` instead.

## Login route

Unauthenticated users who hit a protected route are redirected to Bridge's hosted login page. Hosted login is what you get out of the box.

Set `loginRoute` and `bridgeAuthGuard()` sends unauthenticated users to that in-app route instead — SDK mode. Build the page with [`bridge-login-form`](/auth/ui/email-password/) and register the route itself as public. Either way the page they were heading for is remembered and restored after login; see [Route guards](/auth/securing/route-guards/#returning-to-the-page-they-asked-for).

## All config options

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | (required) | Your Bridge app ID, found in your app's settings in Control Center |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Base URL for the Bridge API; auth, feature flags and the live channel all derive from it. Set it for any non-production app. See [Base URLs](#base-urls) |
| `authBaseUrl` | `string` | `'https://api.thebridge.dev/auth'` | **Not read by the SDK** — derived from `apiBaseUrl` instead. See [Base URLs](#base-urls) |
| `cloudViewsUrl` | `string` | `'https://api.thebridge.dev/cloud-views'` | **Not read by the SDK.** See [Base URLs](#base-urls) |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login. See [Callback URL](#callback-url) |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | (unset) | In-app route of your login page. Set it for SDK mode; leave unset for hosted login. See [Login route](#login-route) |
| `billing.paywallRoute` | `string` | (none) | Route to redirect to when the workspace (called a *tenant* in the API) has no plan selected |
| `billing.paymentErrorRoute` | `string` | `'/payment-error'` | Route to redirect to when a Stripe checkout confirmation fails |
| `locale` | `string` | `'en'` | UI language for the SDK auth components, e.g. `'sv'`. Region variants (`'sv-SE'`) resolve to their base language; an unknown locale falls back to English |
| `messages` | `MessageOverrides` | (none) | Per-key copy overrides applied on top of the locale. See [Translating the auth UI](#translating-the-auth-ui) |
| `returnTo.enabled` | `boolean` | `true` | Set `false` to send every login to `defaultRedirectRoute` regardless of where the visitor was heading |
| `returnTo.param` | `string` | `'redirectUri'` | Query parameter carrying the return target in SDK mode |
| `returnTo.exclude` | `(string \| RegExp)[]` | `[]` | Paths that must never become a return target. Your `loginRoute` is excluded automatically |
| `debug` | `boolean` | `false` | Enable debug logging |

## Translating the auth UI

The SDK auth components ship their own copy — field labels, buttons, alerts,
success messages. Set `locale` once in `provideBridge()` and all of it renders
in that language:

```ts
provideBridge({ appId: '…', locale: 'sv' }, routeConfig)
```

Bridge owns the **mechanics**: what a field is, what a button does, what went
wrong. Your app owns **voice and context**: the page title, the subtitle,
anything naming your product. Bridge cannot know those, which is why every
component takes `[heading]="null"` and `[description]="null"` so you can write
your own.

Shipping locales: **`en`** and **`sv`**. An unknown locale falls back to English
rather than throwing, and a key missing from a locale falls back to English —
a raw key like `login.submit` never renders.

For a phrase you need worded differently, override it per key:

```ts
// app-wide
provideBridge({ appId: '…', locale: 'sv', messages: { 'login.submit': 'Logga in nu' } }, routeConfig)
```

```html
<!-- or one screen only -->
<bridge-login-form [messages]="{ 'login.heading': 'Welcome back' }" />
```

Precedence is component input → config `messages` → `locale` → English. The
override path also covers any language Bridge does not ship yet.

There is no `storage` adapter option: the auth-core `BridgeAuth` singleton owns token storage (`localStorage`) internally.

## Route guard config

The second argument to `provideBridge` declares which routes are public, protected, or flag-gated:

```typescript
interface RouteGuardConfig {
  rules: RouteRule[];
  /** Access for routes no rule matches. @default 'protected' */
  defaultAccess?: 'public' | 'protected';
}

interface RouteRule {
  /** Path to match: exact string, wildcard string ('/beta/*'), or RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
  /** Require feature flag(s): a key, { any: [...] }, or { all: [...] }. */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Where to send users who fail the featureFlag requirement. @default '/' */
  redirectTo?: string;
}
```

Billing gating isn't declared per rule: setting `billing.paywallRoute` on `BridgeConfig` makes the guard redirect an authenticated workspace that hasn't selected a plan to that route before any protected page renders.

See [Route guards](/auth/securing/route-guards/) for a walkthrough.

## Passing values via .env

> **Tip:** this is just a best practice, not a requirement. Keep environment-specific values in a `.env` file instead of hardcoding them, and read them with `import.meta.env` when you build the config. The `NG_APP_` prefix is required for values to reach the browser; the SDK does not read environment variables automatically.

<Tabs>
<TabItem label=".env">

```env
NG_APP_BRIDGE_APP_ID=your-app-id-here
NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
# Only for a non-production app (stage, local, self-hosted):
# NG_APP_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

</TabItem>
<TabItem label="app.config.ts">

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
  apiBaseUrl: import.meta.env.NG_APP_BRIDGE_API_BASE_URL || undefined,
  defaultRedirectRoute: import.meta.env.NG_APP_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
  debug: !environment.production,
};
```

Setting `NG_APP_BRIDGE_API_BASE_URL` in `.env` does nothing on its own — it only takes effect once you pass it as `apiBaseUrl`, as above. Miss that and a stage app ID talks to the production API, where it doesn't exist, and signup fails with `Not Found`.

</TabItem>
</Tabs>

> **Framework note:** the Angular CLI only exposes `NG_APP_`-prefixed variables when you use a `.env` loader such as [`@ngx-env/builder`](https://github.com/chihab/dotenv-run). Without one, set the values in your `src/environments/environment*.ts` files instead and read them from `environment`.

## Configs managed in Control Center

Some settings aren't passed in code at all. They're set once per app, and Bridge enforces them server-side:

| Setting | What it does |
|---------|---------------|
| Redirect URIs | The allowlist of callback URLs Bridge is allowed to redirect to. Any `callbackUrl` you pass to `provideBridge` must already be on this list. |
| Allowed origins | The CORS allowlist: origins permitted to call the Bridge API directly from the browser. It also decides where a magic link may be delivered: Bridge refuses to send one whose [return page](/auth/sign-in/magic-link/#where-the-link-comes-back) is on an origin that isn't listed. |
| Default callback URL | Used whenever your app doesn't pass a `callbackUrl` in code. See [Callback URL](#callback-url). |

- **CLI:**

  ```bash
  bridge app update \
    --redirect-uris "https://app.example.com/oauth-callback,https://admin.example.com/oauth-callback" \
    --allowed-origins "https://app.example.com,https://admin.example.com" \
    --default-callback-uri "https://app.example.com/oauth-callback"
  ```

- **Control Center:** the same settings, managed from your app's settings.
- **MCP (AI-assistant integration):** coming soon.
