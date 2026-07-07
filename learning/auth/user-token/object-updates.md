# How the user token is updated

Once `provideBridge()` bootstraps, your app is subscribed to a live channel for as long as it's open (`BridgeRuntimeService.start()` mounts it once during `APP_INITIALIZER`). When an admin changes something about the signed-in user server-side — their role, their workspace's plan, a permission — Bridge pushes that change down the channel and refreshes the session automatically. Your signals update in place. There's no reload, no polling, and nothing to wire up beyond reading `BridgeService.user` reactively.

## Example: a role change reaching your UI live

```ts
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-admin-gate',
  standalone: true,
  template: `
    @if (bridge.user()?.role === 'admin') {
      <app-admin-panel />
    } @else {
      <p>You don't have access to this area.</p>
    }
  `,
})
export class AdminGateComponent {
  protected readonly bridge = inject(BridgeService);
}
```

If an admin changes this user's role from `member` to `admin` in the Control Center, `bridge.user()?.role` updates on its own and `<app-admin-panel>` appears — no refresh, because the template is driven by the live `bridge.user` signal rather than a value read once on init. Structure your gated UI this way (branch on the signal call, not a snapshot you captured earlier) and it stays correct automatically.

## Reacting to the exact moment something changes

For a side effect at the moment of change — a toast, an analytics event, an audit log — subscribe on the unified events dispatcher:

```ts
import { Component, OnDestroy, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({ selector: 'app-session-watcher', standalone: true, template: '' })
export class SessionWatcherComponent implements OnDestroy {
  private readonly bridge = inject(BridgeService);

  private readonly unsubscribe = this.bridge.events.handle({
    'user.state_changed': (msg) => this.toast(`Your access changed: ${msg.reason}`),
    'session.snapshot': (msg) => console.log('Session refreshed', msg.data),
  });

  ngOnDestroy(): void {
    this.unsubscribe();
  }

  private toast(message: string): void {
    // your toast implementation
  }
}
```

See [Live Updates & the Bridge Surface](../../live-updates/live-updates.md) for the full event catalog.

## What happens while your app is offline

If the live channel drops (network blip, laptop sleep, server restart), `BridgeService`'s signals **freeze at their last-known values** — nothing clears, nothing errors. Bridge doesn't have anything new to tell you, so it doesn't tell you anything.

When the channel reconnects, two things happen automatically:

1. `AuthService.maybeRefreshNow()` proactively refreshes your tokens, in case a role/plan change was broadcast while you were disconnected and missed.
2. The server sends a fresh `session.snapshot`, which atomically overwrites every slice (`bridge.user`, `bridge.tenant`, subscription, entitlements) in one update — so you're back in sync even if several things changed while you were offline.

You can watch the connection itself if you want to show an offline indicator:

```ts
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-connection-badge',
  standalone: true,
  template: `
    @if (bridge.realtimeStatus() !== 'open') {
      <span class="badge">reconnecting…</span>
    }
  `,
})
export class ConnectionBadgeComponent {
  protected readonly bridge = inject(BridgeService);
}
```

`bridge.realtimeStatus()` is one of `'idle' | 'connecting' | 'open' | 'closed'`.

## One slice that doesn't ride this mechanism: the profile

`ProfileService.profile` is refreshed on login and on workspace switch, but a role/plan push that reaches you through `user.state_changed` only refreshes tokens and the `bridge.user` / `bridge.tenant` snapshot slices — it does not automatically re-fetch the richer `Profile` object. If your UI depends on a profile field changing live, read it from `bridge.user` / `bridge.tenant` instead, or call `authService.getBridgeAuth().getProfile()` explicitly when you need the latest value. See [Getting the user token](/auth/user-token/getting-the-token/).
