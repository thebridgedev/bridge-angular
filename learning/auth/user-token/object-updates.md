# How the user token is updated

Once `provideBridge()` connects, your app is subscribed to a live channel (a persistent realtime connection the SDK maintains) for as long as it's open. When an admin changes something about the signed-in user server-side (their role, their workspace's plan, a permission), Bridge pushes that change down the channel and refreshes the session automatically. Your reactive signals update in place. There's no reload, no polling, and nothing to wire up beyond reading `bridge.user` reactively.

## Example: a role change reaching your UI live

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-admin-gate',
  standalone: true,
  template: `
    @if (bridge.user()?.role === 'ADMIN') {
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

If an admin changes this user's role from `MEMBER` to `ADMIN` in Control Center (your admin dashboard at app.thebridge.dev), `bridge.user().role` updates on its own and `<app-admin-panel>` appears without a refresh, because the template is driven by the reactive `bridge.user` signal rather than a value read once on init. Structure your gated UI this way (branch on the live signal, not a snapshot you captured earlier) and it stays correct automatically.

## Reacting to the exact moment something changes

For a side effect at the moment of change (a toast, an analytics event, an audit log), subscribe on the unified events dispatcher:

```ts
import { inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

const bridge = inject(BridgeService);

const unsubscribe = bridge.events.handle({
  'user.state_changed': (msg) => toast(`Your access changed: ${msg.reason}`),
  'session.snapshot': (msg) => console.log('Session refreshed', msg.data),
});
// call unsubscribe() when the consumer is destroyed, e.g. in ngOnDestroy
```

## What happens while your app is offline

If the live channel drops (network blip, laptop sleep, server restart), your signals **freeze at their last-known values**: nothing clears, nothing errors. Bridge doesn't have anything new to tell you, so it doesn't tell you anything.

When the channel reconnects, two things happen automatically:

1. Bridge proactively refreshes your tokens, in case a role/plan change was broadcast while you were disconnected and missed.
2. The server sends a fresh session snapshot (the full current state of the session), which atomically overwrites every part of the `BridgeService` (`bridge.user`, `bridge.tenant`, subscription, entitlements) in one update, so you're back in sync even if several things changed while you were offline.

You can watch the connection itself if you want to show an offline indicator:

```ts
import { realtimeStatus } from '@nebulr-group/bridge-angular';
// 'idle' | 'connecting' | 'open' | 'closed'
```
