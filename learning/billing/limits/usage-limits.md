# Show usage limits in your app

Where an [entitlement](/billing/limits/lock-features/) is a yes/no switch, a **quota** is a metered allowance that a workspace (called a *tenant* in the API) can run down and hit: 10,000 AI calls a month, 20 seats. Quotas are **defined on the plan**; see [Define your plans](/billing/setup/define-plans/) for setting them. This page covers showing quota state in your app and reacting as usage climbs. To submit the usage that fills these quotas, see [Report usage](/billing/limits/report-usage/).

`<bridge-quota-banner>` warns users as they approach a metric's cap so a hard stop never comes as a surprise, and it nudges them to upgrade. It's a live usage-cap banner for one metric: it renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric), shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded. It updates live on `quota.updated` pushes.

```typescript
import { QuotaBannerComponent } from '@nebulr-group/bridge-angular';

@Component({
  // ...
  imports: [QuotaBannerComponent],
  template: `<bridge-quota-banner metric="ai_completions" />`,
})
export class UsagePanelComponent {}
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to watch |
| `label` | `string` | snapshot label, else the metric key | Humanized display label |
| `className` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(snap) => void` | (none) | Override the default Upgrade CTA handler |
| `actionHref` | `string` | — | Upgrade CTA destination for this instance. Overrides `billing.manageRoute` config; `onActionClick` takes precedence over both |

Like `<bridge-billing-notice>`, the default Upgrade CTA navigates to
`billing.manageRoute` (default `/subscription`, served by `bridgeBillingRoutes()`).

## Three levels, lowest first

Pick the lowest level that does the job ([How Bridge works](../../mechanisms.md), section 4).

**Level 0 — nothing on the page.** Your backend refuses at the cap with `402 QUOTA_EXCEEDED` (bridge-nestjs `@RequireQuota`); with `bridgeInterceptor` provided once (`provideHttpClient(withInterceptors([bridgeInterceptor]))`) or calls made with `bridgeFetch()`, the upgrade dialog `provideBridge()` mounts opens, names the metric, and links to the subscription page. A member who cannot manage billing is told to ask the workspace owner. `billing.upgradeDialog: false` turns it off (listen with `onBridgeQuotaExceeded()`); a component there replaces it.

**Level 1 — one component or directive.** The action is disabled at a known hard cap, with an upgrade line beside it:

```html
<bridge-quota-gate metric="tickets">
  <button (click)="createTicket()">New ticket</button>
  <!-- optional: your own line at the cap -->
  <span *bridgeQuotaAtLimit="let q">{{ q.used }} of {{ q.limit }} tickets used.</span>
</bridge-quota-gate>

<!-- or on the control itself -->
<button [bridgeQuotaGate]="'tickets'" (click)="createTicket()">New ticket</button>
```

It never disables on "don't know yet": while loading, with no quota on the plan, or for a metered quota, the action stays enabled.

**Level 2 — your own UI.** `injectQuota(metric)` returns a signal of the live numbers:

```ts
import { Component } from '@angular/core';
import { injectQuota } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-tickets-meter',
  standalone: true,
  template: `
    @if (tickets().loading) { Loading… }
    @else if (tickets().unlimited) { Unlimited tickets }
    @else { {{ tickets().used }} of {{ tickets().limit }} tickets }
  `,
})
export class TicketsMeterComponent {
  readonly tickets = injectQuota('tickets');
}
```

`used`, `limit` and `remaining` stay `null` while `loading` — never `0`. `kind` says whether the metric is a `counter` (resets each period) or a `gauge` (a count your app reports).
