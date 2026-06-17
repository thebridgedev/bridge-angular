# Live Updates & the Bridge Surface

Every Bridge app holds one live channel to the platform. On connect (and on every reconnect) the server pushes a `session.snapshot` with everything your UI needs — branding, workspace, subscription, entitlements, user — and after that, targeted pushes keep it current: flag changes, plan changes, payment events, quota updates. No polling, no refresh.

The **`BridgeService`** is the single injectable that exposes all of it, grouped by scope. In Angular every slice is a **signal** (the equivalent of bridge-svelte's readable stores).

```ts
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-account',
  standalone: true,
  template: `
    @if (bridge.app.branding(); as branding) {
      <img [src]="branding.logo" [alt]="branding.name" />
    }
    <p>Workspace: {{ bridge.tenant.name() }}</p>
    <p>Plan: {{ bridge.tenant.subscription()?.plan?.name }}</p>
    <p>Signed in as {{ bridge.user()?.email }}</p>
  `,
})
export class AccountComponent {
  protected readonly bridge = inject(BridgeService);
}
```

Every slice is an Angular signal. They are `null` until the channel delivers the first snapshot — gate on null for skeletons, or fall back to defaults. The `BridgeService` is a singleton (`providedIn: 'root'`); inject it anywhere.

### The scopes

| Path | Type | What it holds |
|------|------|---------------|
| `bridge.app.branding` | `Signal<BrandingSnapshot \| null>` | Whitelabel branding: `logo`, `name`, colors, font |
| `bridge.app.plans` | lazy slice | Full plan catalog — `await bridge.app.plans` fetches on first access |
| `bridge.tenant.id` / `.name` | `Signal<string \| null>` | Current workspace identity |
| `bridge.tenant.subscription` | `Signal<SubscriptionSnapshot \| null>` | Canonical plan + status + endsAt (see the Payments guide) |
| `bridge.tenant.entitlements` | `snapshot` signal + `can(key)` | Plan-granted capabilities, replaced live on change |
| `bridge.user` | `Signal<UserSnapshot \| null>` | Authenticated user: `id`, `email`, `role`, `tenantId` |
| `bridge.attributes` | write surface | Publish your own attributes into flag targeting (below) |
| `bridge.events` | dispatcher | Subscribe to every live channel event (below) |
| `bridge.realtimeStatus` | `Signal<ConnectionState>` | Current live-channel connection state |

### Handling live events

`bridge.events.handle({...})` is the one API for reacting to channel events — use it for side effects like analytics, audit logging, or alerting (UI state updates automatically through the signals above and the drop-in components):

```ts
import { Component, OnDestroy, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({ /* ... */ })
export class AnalyticsComponent implements OnDestroy {
  private readonly bridge = inject(BridgeService);

  private readonly unsubscribe = this.bridge.events.handle({
    'flag.updated':              (m) => console.log('flag changed:', m.flag.key),
    'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
    'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
    'session.snapshot':          (m) => analytics.track('hydrated'),
    '*':                         (m) => debugLog(m.kind, m),
  });

  ngOnDestroy(): void {
    // one call removes every handler registered above
    this.unsubscribe();
  }
}
```

Event kinds:

- **Flags:** `flag.updated`, `flag.removed`
- **Session:** `session.snapshot`, `user.state_changed`
- **Subscription:** `subscription.plan_changed`, `subscription.created` / `updated` / `canceled` / `reactivated`, `subscription.trial_started` / `trial_ending_soon` / `trial_converted` / `trial_expired`
- **Payments:** `payment.succeeded`, `payment.failed`, `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted`
- **Quotas & entitlements:** `quota.updated`, `entitlements.changed`

Semantics worth knowing:

- **Multiple handlers per kind** — every registered handler fires; registering is additive across your app.
- **`'*'` is a fallback**, not a firehose: it fires only for kinds that have no specific handler registered (so you never double-handle).
- **Errors are isolated** — one throwing handler doesn't block the others or break the dispatch loop.

### Publishing your own attributes

`bridge.attributes` is the write surface for feeding your own data into feature-flag targeting. Keys you publish here are usable in flag rules immediately and win over Bridge-managed attributes on collision:

```ts
import { inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

const bridge = inject(BridgeService);

// Static value
bridge.attributes.set('beta_cohort', true);

// Live-bound — the getter re-runs on every flag evaluation
bridge.attributes.bind('cart_size', () => cart.items.length);

// Bulk — one getter returning a whole map
bridge.attributes.bindMany(() => ({
  theme: currentTheme,
  locale: navigator.language,
}));

// Read the merged map / remove keys
bridge.attributes.get();
bridge.attributes.unset('beta_cohort');
```

The `bridge:` namespace is reserved for Bridge-managed attributes — writes to it are rejected with a console warning. Pass `{ observed: false }` to `set`/`bind`/`bindMany` to keep a key out of attribute-discovery telemetry.

### Connection status

The channel's connection state is exposed as a signal on `BridgeService`:

```ts
@Component({
  selector: 'app-status',
  standalone: true,
  template: `
    @if (bridge.realtimeStatus() !== 'open') {
      <span class="badge">reconnecting…</span>
    }
  `,
})
export class StatusComponent {
  protected readonly bridge = inject(BridgeService);
}
```

While the channel is down, everything keeps working from the last known state — flags evaluate from cache, signals hold their last snapshot. On reconnect the server re-sends a full `session.snapshot`, so every slice updates atomically and nothing is missed.

### How it's wired

`provideBridge(...)` registers an `APP_INITIALIZER` that mounts the realtime runtime once during app bootstrap — the Angular equivalent of bridge-svelte's `<BridgeBootstrap />`. You never start the channel by hand; it follows your auth token automatically (login binds the user/workspace channel scopes, logout drops them).
