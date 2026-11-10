# Live updates and the `BridgeService`

Every Bridge app holds one **live channel** to the platform: a persistent realtime connection the SDK maintains for you. On connect (and on every reconnect) the server pushes a `session.snapshot` with everything your UI needs (branding, workspace, subscription, entitlements, user), and after that, targeted pushes keep it current: flag changes, plan changes, payment events, quota updates. No polling, no refresh.

The **`BridgeService`** is the single object that exposes all of it, grouped by scope:

```typescript
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

Every field is an Angular signal. They are `null` until the channel delivers the first snapshot; gate on null for skeletons, or fall back to defaults. The `BridgeService`'s identity is stable; destructure and pass sub-references freely.

A note on naming: a workspace is called a *tenant* in the API, which is why the identifiers below say `tenant`.

### The scopes

| Path | Type | What it holds |
|------|------|---------------|
| `bridge.app.branding` | `Signal<BrandingSnapshot \| null>` | Whitelabel branding: `logo`, `name`, colors, font |
| `bridge.app.plans` | fetched on first access and cached | Full plan catalog: `await bridge.app.plans` fetches it the first time you read it |
| `bridge.tenant.id` / `.name` | `Signal<string \| null>` | Current workspace identity |
| `bridge.tenant.subscription` | `Signal<SubscriptionSnapshot \| null>` | Canonical plan + status + endsAt (see [How billing works](/billing/how-it-works/)) |
| `bridge.tenant.entitlements` | `snapshot` signal + `can(key)` | Plan-granted capabilities, replaced live on change |
| `bridge.user` | `Signal<UserSnapshot \| null>` | Authenticated user: `id`, `email`, `role`, `tenantId` |
| `bridge.attributes` | write surface | Publish your own attributes into flag targeting (below) |
| `bridge.events` | dispatcher | Subscribe to every live channel event (below) |

### Handling live events

`bridge.events.handle({...})` is the one API for reacting to channel events. Use it for side effects like analytics, audit logging, or alerting (UI state updates automatically through the signals above and the drop-in components):

```typescript
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
- **Payments:** `payment.succeeded`, `payment.failed`, `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted` (dunning is the automated payment-retry process that follows a failed charge)
- **Quotas & entitlements:** `quota.updated`, `entitlements.changed`

Semantics worth knowing:

- **Multiple handlers per kind**: every registered handler fires; registering is additive across your app.
- **`'*'` is a fallback**, not a firehose: it fires only for kinds that have no specific handler registered (so you never double-handle).
- **Errors are isolated**: one throwing handler doesn't block the others or break the dispatch loop.

### Publishing your own attributes

`bridge.attributes` is the write surface for feeding your own data into feature-flag targeting. Keys you publish here are usable in flag rules immediately and win over Bridge-managed attributes on collision:

```typescript
import { inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

const bridge = inject(BridgeService);

// Static value
bridge.attributes.set('beta_cohort', true);

// Live-bound: the getter re-runs on every flag evaluation
bridge.attributes.bind('cart_size', () => cart.items.length);

// Bulk: one getter returning a whole map
bridge.attributes.bindMany(() => ({
  theme: currentTheme,
  locale: navigator.language,
}));

// Read the merged map / remove keys
bridge.attributes.get();
bridge.attributes.unset('beta_cohort');
```

The `bridge:` namespace is reserved for Bridge-managed attributes; writes to it are rejected with a console warning. Pass `{ observed: false }` to `set`/`bind`/`bindMany` to keep a key out of attribute-discovery telemetry.

### Connection status

The live channel's connection state is exposed as a signal on the `BridgeService` (and as the standalone `realtimeStatus` export):

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

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

While the channel is down, everything keeps working from the last known state: flags evaluate from cache, signals hold their last snapshot. On reconnect the server re-sends a full `session.snapshot`, so every scope updates atomically and nothing is missed.

### When live updates are off

`realtimeStatus` is just the state (`'idle'`, `'connecting'`, `'open'`, `'closed'`, `'unauthorized'`, `'degraded'`). `realtimeStatusDetail` adds why:

| Field | Meaning |
|-------|---------|
| `state` | Same value as `realtimeStatus` |
| `reason` | Machine-readable reason when live updates are not working, e.g. `expired` |
| `side` | Whose move it is: `app` (your app's session/token handling), `config` (your Bridge settings — `apiBaseUrl`, `appId` or the app's configuration in Bridge — don't match), `bridge` (nothing to change in your app) or `network` (transient; the client is retrying) |
| `retrying` | `true` while the client keeps trying on its own |
| `hint` | One sentence naming the fix, when the client knows it (for example the origin to add in Bridge admin) |
| `docsUrl` | Troubleshooting page for this `reason` |
| `ref` | Support reference for this run of trouble |

Every `reason` has an entry in [Live Updates Troubleshooting](/live-updates/troubleshooting/): what it means, whose side it is on, and the exact fix. The console message, `docsUrl` and the dev badge all link straight to it.

`realtimeStatusDetail` is a signal on the `BridgeService` (and a standalone export):

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-live-status',
  standalone: true,
  template: `
    @if (bridge.realtimeStatusDetail().state === 'unauthorized') {
      <p>
        Live updates are off ({{ bridge.realtimeStatusDetail().reason }}).
        <a [href]="bridge.realtimeStatusDetail().docsUrl">Why?</a>
      </p>
    }
  `,
})
export class LiveStatusComponent {
  protected readonly bridge = inject(BridgeService);
}
```

For side effects (logging, alerting) subscribe instead; it returns an unsubscribe function:

```typescript
import { inject } from '@angular/core';
import { BridgeRuntimeService } from '@nebulr-group/bridge-angular';

const stop = inject(BridgeRuntimeService).onStatus((status) => {
  if (status.reason) console.warn('live updates:', status.reason, status.side);
});
```

**Dev badge.** In development builds, `provideBridge()` mounts a small "Live updates off — why?" badge in the corner whenever live updates are refused (`unauthorized`), connected but receiving nothing (`degraded`), or still retrying after 30 seconds. It shows the reason, whose side it is, a docs link and the support reference, and can be dismissed until a different problem appears. It never renders in production builds. Turn it off in development too with `devBadge: false` in the config you pass to `provideBridge()`. The badge is exported as `RealtimeDevBadgeComponent` if you want to place it yourself.

### Relationship to the service-level surface

The `BridgeService` and the original service surface (the `AuthService` signals `appConfig`, `subscription`, `profile`, `authState`, `isAuthenticated`, ...) are both supported and fed by the same internal state. The `BridgeService` is the newer, scoped way to read live platform state; `AuthService` remains the API for auth state and the classic checkout flow, covered in the [Auth](/auth/) and [How billing works](/billing/how-it-works/) guides. Use whichever fits; they don't conflict.
