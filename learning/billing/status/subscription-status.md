# Show subscription status

A small, at-a-glance indicator of where the subscription of the workspace (called a *tenant* in the API) stands: the current plan name plus a status badge (trial, active, past due, canceled). Handy in a nav bar, account menu, or settings header so users always know their billing state. It mounts and subscribes itself; no inputs, no wiring.

```typescript
import { SubscriptionStatusComponent } from '@nebulr-group/bridge-angular';

@Component({
  // ...
  imports: [SubscriptionStatusComponent],
  template: `<bridge-subscription-status />`,
})
export class NavBarComponent {}
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Class applied to the root span |

## What drives it

The component subscribes to the canonical subscription state, the same plan and status that `bridge.tenant.subscription` exposes (see [How billing works](/billing/how-it-works/)). It reads on mount (unless a read younger than 30 seconds exists) and then follows the state: it is re-read on a plan or subscription change, when the sign-in is renewed, and when the tab regains focus after 30 seconds, so a plan change in Bridge shows up without a reload. A re-read keeps the current plan on screen. While the first read is in flight it shows a loading placeholder; a failed read is retried once before it says "Subscription unavailable"; if the workspace has no subscription it renders "No subscription".

The badge shows the raw subscription status: `trial`, `active`, `past_due`, `cancel_at_period_end`, or `canceled`.

## Styling

Beyond the `className` input, the component exposes stable CSS classes you can target:

| Class | Element |
|-------|---------|
| `bridge-subscription-status` | Root span |
| `bss-plan` | Plan name |
| `bss-badge`, `bss-badge-<status>` | Status badge; the modifier is the status, e.g. `bss-badge-active`, `bss-badge-past_due` |
| `bss-loading`, `bss-error`, `bss-empty` | Loading, error, and no-subscription states |

## Beyond a badge

This component only displays state. To warn users when billing needs attention (trial ending, payment failed, locked), add [`<bridge-billing-notice />`](/billing/status/billing-notices/). For the underlying subscription model and the reactive signal behind it, see [How billing works](/billing/how-it-works/).
