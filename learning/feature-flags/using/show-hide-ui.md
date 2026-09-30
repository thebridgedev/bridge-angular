# Show or hide UI

The most common thing to do with a flag is decide whether a piece of UI renders at all. The `<bridge-feature-flag>` component does that declaratively, with optional fallback content for the off case:

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

> **Framework note:** the default projected content renders when the flag
> passes; the element marked with `*bridgeFeatureFlagFallback` renders when it
> doesn't. The projected "on" content does not receive the evaluated value the
> way Svelte snippets do; when you need the value itself (a string, number, or
> JSON flag), read it with `bridge.flag` instead; see
> [Use flags in your logic](/feature-flags/using/in-logic/).

## Say why a feature is off

The fallback template knows why the flag is off. Declare `let reason = reason`
(and `let feature = feature`) on it:

```html
<bridge-feature-flag key="reports">
  <app-reports />
  <ng-container *bridgeFeatureFlagFallback="let reason = reason; let feature = feature">
    @if (reason === 'plan') {
      <a routerLink="/billing">Upgrade your plan to use reports</a>
    } @else if (reason === 'permission') {
      <p>Ask a workspace admin for access to reports.</p>
    }
  </ng-container>
</bridge-feature-flag>
```

`reason` is `'plan'` (an upgrade alone would turn it on), `'permission'` (this
person's role or privileges), `'off'` (switched off for everyone), `'rule'`
(another condition in the rule) or `'rollout'`. It is `undefined` when Bridge
has not said, for example before the flags have loaded. With `'plan'`,
`feature` is the plan feature the rule asks for. The decided value is there too
(`let value`).

## Sending context

`<bridge-feature-flag>` takes the same per-call eval context (the identity and attributes a flag rule evaluates against) as `bridge.flag`'s third argument. Use it when the rule targets an app-specific attribute Bridge doesn't already know (see [Send context from your code](/feature-flags/targeting/send-context/)):

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

Since `context` is a plain input, it's reactive for free: Angular re-evaluates the bound expression (and re-renders the flag) whenever `projects.length` changes, with no extra wiring needed the way the standalone `bridge.flag` accessor requires.

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | **(required)** | The flag key |
| `defaultValue` | `T` | `false` | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | (none) | Per-call eval context (attributes win on collision) |
| default slot | projected content | (none) | Rendered when the flag passes |
| `*bridgeFeatureFlagFallback` | projected content | (none) | Rendered when it doesn't; its context has `value`, `reason` and `feature` |
