# Use flags in your logic

`bridge.flag` returns a plain reactive value; it isn't tied to markup. You'll
often use it to decide *what to render* (see [Show or hide UI](/feature-flags/using/show-hide-ui/)
for that, using the `<bridge-feature-flag>` component), but it's just as much for
deciding *what to do*: which function handles something, what limit to
enforce, which calculation to run. This page covers the `bridge.flag` API itself,
starting with the render case and then a pure-logic one.

## bridge.flag: reactive flag values

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

`bridge.flag(key, defaultValue, context?)` returns a `Signal<{ value, passed }>` backed by Angular signals:

| Field | Description |
|-------|-------------|
| `value` | The evaluated flag value, typed from your default (`boolean` \| `string` \| `number` \| JSON object) |
| `passed` | Whether a rule branch matched |

The result is **reactive**: when an admin changes the flag (or a live rule update arrives), `value` updates in place. The default is mandatory: it's what your app gets when the flag isn't configured or Bridge is unreachable. A flag call can never break your app.

> **Framework note:** unlike Svelte's `useFlag`, the arguments are plain values,
> not getters. Create the accessor in an injection context (a field initializer
> or constructor); the per-call `context` is captured at creation time, so for
> attributes that change over time use `bridge.attributes.bind` or the
> `<bridge-feature-flag>` component's reactive `[context]` input.

## Branching plain logic, not markup

The same `bridge.flag` value works in a method body just as well as in a
template. Nothing renders; it just changes which code path runs:

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({ /* ... */ })
export class PricingComponent {
  private readonly bridge = inject(BridgeService);

  private readonly useV2Pricing = this.bridge.flag('pricing_engine_v2', false);
  private readonly maxUploads = this.bridge.flag('max_uploads', 10);

  calculateTotal(cart: CartItem[]): number {
    // Route to one implementation or the other, no UI involved.
    return this.useV2Pricing().value
      ? this.calculateTotalV2(cart)
      : this.calculateTotalV1(cart);
  }

  canUploadMore(currentCount: number): boolean {
    // Gate an action with a value an admin can tune without a deploy.
    return currentCount < this.maxUploads().value;
  }
}
```

Note the injection context: `bridge.flag` is built on Angular's `computed`, so
it's only safe to create inside a component or service constructor or a field
initializer. Outside a reactive context, use `bridge.evaluate` (below) instead.

Both read the same live, reactive value as the rendering examples above. An
admin ramping `pricing_engine_v2` from 10% to 100%, or raising `max_uploads`
from 10 to 25, takes effect immediately, with no code change on your side.

## bridge.evaluate: one-shot reads

For code that needs a synchronous read outside a reactive context (a plain
function, a guard, a resolver), `bridge.evaluate(key, defaultValue, context?)`
returns the same `{ value, passed }` shape without any reactivity:

```typescript
const { value, passed } = this.bridge.evaluate('pricing_engine_v2', false);
```

## Multi-type values

One API for boolean, string, number, and JSON flags; the type is inferred from the default:

```typescript
const isDark = this.bridge.flag('dark_mode', false);
const cta    = this.bridge.flag('checkout_text', 'Submit');
const limit  = this.bridge.flag('max_uploads', 10);
const cfg    = this.bridge.flag('rate_limit', { window: 60, max: 100 });
```

A type mismatch (the flag's value in Control Center, your admin dashboard at app.thebridge.dev, has a different type than your default suggests) returns the default and logs a warning.
