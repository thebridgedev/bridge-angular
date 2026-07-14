# Show or hide UI

Declarative gating with optional fallback content. Project the "on" content as
the default slot; use the `*bridgeFeatureFlagFallback` structural directive for
the "off" case:

```typescript
import { Component } from '@angular/core';
import {
  FeatureFlagComponent,
  BridgeFeatureFlagFallbackDirective,
} from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-dashboard',
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

The default projected content renders when the flag passes; the element marked
with `*bridgeFeatureFlagFallback` renders when it doesn't. Both re-render in
place whenever the flag changes (realtime push, token change, dev-attribute
change).

## Sending context

`<bridge-feature-flag>` takes the same per-call context as `bridge.flag`'s third
argument, via the `[context]` input — use it when the rule targets an
app-specific attribute Bridge doesn't already know (see [Send context from your
code](/feature-flags/targeting/send-context/)):

```typescript
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FeatureFlagComponent],
  template: `
    <bridge-feature-flag
      key="new_dashboard"
      [defaultValue]="false"
      [context]="{ attributes: { project_count: projects.length } }"
    >
      <app-new-dashboard />
    </bridge-feature-flag>
  `,
})
export class DashboardPage {
  projects: Project[] = [];
}
```

Since `context` is a normal Angular input, it's reactive for free — Angular
re-evaluates the bound expression (and re-renders the flag) whenever
`projects.length` changes, no getter function needed the way the standalone
`bridge.flag` accessor requires.

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | **(required)** | The flag key |
| `defaultValue` | `T` | `false` | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | — | Per-call eval context (attributes win on collision) |
| default slot | content | — | Rendered when the flag passes |
| `*bridgeFeatureFlagFallback` | content | — | Rendered when it doesn't |
