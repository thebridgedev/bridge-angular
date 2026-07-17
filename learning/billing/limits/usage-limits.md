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

## Reading quota state yourself

For a fully custom quota UI, read the underlying snapshot directly:

```ts
import { useBridge } from '@nebulr-group/bridge-angular';

const q = useBridge().quota('ai_completions');
// undefined while loading (first call triggers a fetch), then:
// q?.used, q?.limit, q?.remaining, q?.warningLevel ('approaching' | 'critical' | null)
```

> **Framework note:** this is auth-core's `useBridge`, re-exported by
> `@nebulr-group/bridge-angular`. It's a temporary escape hatch: the Angular SDK
> doesn't yet expose quota state on the `BridgeService` surface. For a reactive
> read that follows `quota.updated` pushes, wrap the metric with
> `createQuotaSignal(metric)` (also exported by the SDK) and call `.destroy()`
> in `ngOnDestroy`. Until the SDK surfaces quotas on `bridge.tenant`, these are
> the two reads available.
