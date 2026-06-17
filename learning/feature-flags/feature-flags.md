# Feature Flags

Bridge Feature Flags evaluates locally — the SDK keeps the flag rules in memory, evaluates against in-process context, and receives rule changes live over a push channel. A flag check is an O(1) lookup: no network call, safe in render paths.

Flags work standalone: an `appId` is all the configuration you need. Bridge auth and billing are optional context sources (see "Bridge-managed attributes" below).

### Setup

Bridge bootstraps flags automatically. `provideBridge(...)` wires an
`APP_INITIALIZER` that mounts the realtime runtime and initializes Feature Flags
2.0 on the shared channel during app bootstrap — no flag-specific init call:

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID, // only appId is required for flags-only apps
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(bridgeConfig)],
};
```

### bridge.flag — reactive flag values

`BridgeService.flag(key, defaultValue, context?)` returns a
`Signal<{ value, passed }>` — the Angular equivalent of bridge-svelte's `useFlag`:

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-banner',
  standalone: true,
  template: `
    @if (banner().value) {
      <div class="banner">New stuff!</div>
    }
  `,
})
export class BannerComponent {
  private readonly bridge = inject(BridgeService);
  protected readonly banner = this.bridge.flag('show_banner', false);
}
```

- **`value`** — the evaluated flag value, typed from your default (`boolean` | `string` | `number` | JSON object).
- **`passed`** — whether a rule branch matched.
- The result is **reactive**: when an admin changes the flag (or a live rule update arrives), the signal re-runs and your template updates in place.
- The default is mandatory — it's what your app gets when the flag isn't configured or Bridge is unreachable. A flag call can never break your app.

> Call `bridge.flag(...)` from a component/service injection context (a field
> initializer or constructor) because it builds an Angular `computed`. For
> one-shot, non-reactive reads use `bridge.evaluate(key, default, context?)`.

### Per-call context

The optional third argument supplies per-call identity/attributes. Per-call attributes win over everything else on key collision:

```typescript
protected readonly checkout = this.bridge.flag('new_checkout', false, {
  attributes: { cart_size: this.cart.items.length },
});
```

### App-wide attributes (`bridge.attributes`)

For attributes that every flag evaluation should see — not just one call site — publish them once on the unified bridge surface:

```typescript
const bridge = inject(BridgeService);

bridge.attributes.set('beta_cohort', true);                     // static value
bridge.attributes.bind('cart_size', () => this.cart.items.length); // re-read on every eval
bridge.attributes.bindMany(() => ({ theme, locale }));          // bulk getter
```

Precedence on key collision: per-call context > `bridge.attributes` > Bridge-managed providers. The `bridge:` namespace is reserved — writes to it are rejected with a console warning. See the Live Updates guide for the full `bridge.attributes` API.

### bridge-feature-flag component

Declarative gating with optional fallback content. Project the "on" content as
the default slot; use the `*bridgeFeatureFlagFallback` structural directive for
the "off" case:

```typescript
import {
  FeatureFlagComponent,
  BridgeFeatureFlagFallbackDirective,
} from '@nebulr-group/bridge-angular';

@Component({
  standalone: true,
  imports: [FeatureFlagComponent, BridgeFeatureFlagFallbackDirective],
  template: `
    <bridge-feature-flag key="new_dashboard" [defaultValue]="false">
      <app-new-dashboard />
    </bridge-feature-flag>

    <!-- With fallback for the non-matching case: -->
    <bridge-feature-flag key="premium_feature" [defaultValue]="false">
      <button>Use premium feature</button>
      <button *bridgeFeatureFlagFallback disabled title="Upgrade to unlock">
        Premium (locked)
      </button>
    </bridge-feature-flag>
  `,
})
export class DashboardPage {}
```

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | **(required)** | The flag key |
| `defaultValue` | `T` | `false` | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | — | Per-call eval context (attributes win on collision) |
| default slot | content | — | Rendered when the flag passes |
| `*bridgeFeatureFlagFallback` | content | — | Rendered when it doesn't |

### flagSignal — standalone helper

For code outside a `BridgeService` injection (or when you want the helper
directly), `flagSignal(key, default, context?)` returns the same
`Signal<FlagEvalResult<T>>`:

```typescript
import { flagSignal } from '@nebulr-group/bridge-angular';

protected readonly banner = flagSignal('show_banner', false);
```

### Multi-type values

One API for boolean, string, number, and JSON flags — the type is inferred from the default:

```typescript
const isDark = this.bridge.flag('dark_mode', false);
const cta    = this.bridge.flag('checkout_text', 'Submit');
const limit  = this.bridge.flag('max_uploads', 10);
const cfg    = this.bridge.flag('rate_limit', { window: 60, max: 100 });
```

A type mismatch (admin stored a different type than your default suggests) returns the default and logs a warning.

### Identity & anonymous visitors

The SDK manages identity for you:

- On first load, it generates an anonymous ID and persists it (configurable: `persistent` localStorage / `session` sessionStorage / `none` in-memory) — anonymous visitors get stable bucketing for A/B tests and percentage rollouts.
- With Bridge auth enabled, the session identity is used automatically and pre-login activity is linked on login.

### Live connection status

```typescript
const bridge = inject(BridgeService);
// reactive ConnectionState signal: 'idle' | 'connecting' | 'open' | 'closed' …
bridge.realtimeStatus();
```

When the live channel drops, flags freeze on last-known values and refetch on reconnect — your app keeps working through Bridge outages.

### Bridge-managed attributes

With Bridge auth and/or billing enabled, attributes like `bridge:user.role`, `bridge:tenant.plan`, and `bridge:billing.plan` merge into every evaluation automatically — no app code. Your own (dev-supplied) attributes always win on key collision, and the admin UI surfaces collisions on the flag detail page.

With billing enabled this includes quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`) — the recommended way to gate plan-granted features is a flag whose rule targets an entitlement attribute. See the Payments guide's Entitlements section for the pattern.

### Propagating context to your backend

If your backend also evaluates flags for the same user, forward the eval context so both sides agree on identity and bucketing. The SDK serializes the context into the `x-bridge-context` header; backend SDKs (e.g. `@nebulr-group/bridge-nestjs/flags` with `BridgeContextInterceptor`) pick it up automatically.

Only propagate identity and attributes the backend can't derive itself — never `role`/`plan`-style attributes (the backend reads those from its own verified sources).

### Route-level flags

Gate entire routes behind flags with `routeConfig` rules:

```typescript
const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};
```

A `featureFlag` requirement on a route rule is evaluated by `bridgeAuthGuard()`
before the route renders — it reads the hydrated FF 2.0 flag cache, independent
of the in-component `bridge.flag` / `<bridge-feature-flag>` surface. The runtime
warms the flag cache at bootstrap, so no extra setup is needed: declare the rule
and the guard redirects when the flag is off.
