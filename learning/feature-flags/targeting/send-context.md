# Send context from your code

## When to send your own context

Rules target on data, and Bridge already supplies some of that data for free — if the account is signed in, `user.role` and `tenant.plan` are already in every evaluation with zero code on your part (see [Target by plan or role](/feature-flags/targeting/by-plan-or-role/)).

Send your own context when the thing you want to target on is something only *your app* knows — a business fact that lives in your own data, not in Bridge. For example: "only show the new dashboard to users with more than 3 projects." Bridge has no idea how many projects a user has, so you tell it:

```typescript
protected readonly dashboard = this.bridge.flag('new_dashboard', false, {
  attributes: { project_count: this.projects.length },
});
```

With `project_count` flowing in, the admin can add a rule in Control Center — `project_count greater than 3` — without you touching this code again. That's the pattern: send whatever app-specific fact the targeting decision depends on, once, and every future rule change is a Control Center edit, not a redeploy.

There are two ways to send it, depending on how widely it applies.

## Per-call context

The optional third argument supplies identity/attributes for **one call site** — use this for a value that's only meaningful to that particular flag check, like `cart_size` on a checkout flag. Per-call attributes win over everything else on key collision:

```typescript
protected readonly checkout = this.bridge.flag('new_checkout', false, {
  attributes: { cart_size: this.cart.items.length },
});
```

`<bridge-feature-flag>` takes the same context via its `[context]` input instead of a third argument — see [Show or hide UI](/feature-flags/using/show-hide-ui/#sending-context) for the component form. The one difference: because the `bridge.flag` accessor is created once (in a field initializer or constructor), pass a fresh signal-derived value if the attribute changes over time, whereas `<bridge-feature-flag [context]="...">` re-evaluates automatically since it's a normal Angular input.

## App-wide attributes (`bridge.attributes`)

Use this instead when a value should be available to **every** flag evaluation across your app, not just one call site — so you don't have to remember to pass it into every `bridge.flag` call that might eventually want it. A good example is something set once near login or app start, like a beta cohort, that several unrelated flags might target on over time:

```typescript
import { inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

const bridge = inject(BridgeService);

bridge.attributes.set('beta_cohort', true);                        // static value
bridge.attributes.bind('cart_size', () => this.cart.items.length); // re-read on every eval
bridge.attributes.bindMany(() => ({ theme, locale }));             // bulk getter
```

Precedence on key collision: per-call context > `bridge.attributes` > Bridge-managed providers. The `bridge:` namespace is reserved — writes to it are rejected with a console warning. See the [Live Updates guide](/live-updates/) for the full `bridge.attributes` API.
