# Bridge Angular — Feature Flags

You are adding **Feature Flags 2.0** to an Angular (standalone-components, v19+)
application that uses The Bridge. The goal is to ship code behind a switch you
control from the Bridge dashboard — no redeploy needed.

Bridge evaluates flags **locally in the SDK** against a cache of flag rules that
syncs live from the Bridge API. The cache rides the same realtime channel as auth
+ billing — toggling a flag in the dashboard updates the app **without a refresh**.
Flags are auth-free: they evaluate for every visitor, logged in or not.

## 1. Install

Use whatever package manager the project's lockfile says (npm shown):

```bash
npm install @nebulr-group/bridge-angular
# or: yarn add @nebulr-group/bridge-angular
# or: pnpm add @nebulr-group/bridge-angular
```

> **No `/flags` subpath.** Unlike the React/Svelte plugins, the Angular flag API
> is on the **main entry** — import everything from `@nebulr-group/bridge-angular`.

## 2. Init — `provideBridge()` in `appConfig`

`provideBridge()` boots the Bridge core runtime (realtime channel + the flag eval
cache) via an `APP_INITIALIZER`. There is no separate flags provider — adding
`provideBridge()` is all the wiring flags need.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: 'your-app-id', // your Bridge workspace app id
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(bridgeConfig),
  ],
};
```

In a real app, read `appId` from your `environment.ts` rather than hard-coding it:

```ts
// src/environments/environment.ts
export const environment = { bridgeAppId: '<your-app-id>' };
```
```ts
const bridgeConfig: BridgeConfig = { appId: environment.bridgeAppId };
```

Flags start evaluating for all visitors as soon as the app initializes — login is
not required.

## 3. First flag call

### Declarative — `<bridge-feature-flag>`

The flag key is the `key` input. Default content renders when the flag is on; mark
the off-state element with the `*bridgeFeatureFlagFallback` structural directive.
The flag is auto-created in Bridge as off the first time it renders.

```ts
// src/app/flags-demo/flags-demo.component.ts
import { Component } from '@angular/core';
import {
  FeatureFlagComponent,
  BridgeFeatureFlagFallbackDirective,
} from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-flags-demo',
  standalone: true,
  imports: [FeatureFlagComponent, BridgeFeatureFlagFallbackDirective],
  template: `
    <h1>Feature Flag Demo</h1>
    <p>Toggle <strong>demo-flag</strong> in the Bridge dashboard — no refresh needed.</p>

    <bridge-feature-flag key="demo-flag" [defaultValue]="false">
      <div style="padding:2.5rem;background:#d4edda;color:#155724;border-radius:10px">
        <strong>demo-flag</strong> is <strong>enabled</strong>.
      </div>
      <div
        *bridgeFeatureFlagFallback
        style="padding:2.5rem;background:#f0f0f0;color:#555;border-radius:10px"
      >
        This box turns green once you enable <strong>demo-flag</strong>.
      </div>
    </bridge-feature-flag>
  `,
})
export class FlagsDemoComponent {}
```

### Reactive — the `flagSignal` helper

For branching in templates or code, use `flagSignal`. It returns an Angular
`Signal<{ value, passed }>` that re-evaluates whenever the flag changes. Call it
from an injection context (a field initializer or constructor):

```ts
import { Component } from '@angular/core';
import { flagSignal } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-checkout',
  standalone: true,
  template: `
    @if (newCheckout().passed) {
      <button>Try the new checkout</button>
    }
  `,
})
export class CheckoutComponent {
  readonly newCheckout = flagSignal('new-checkout', false);
}
```

Non-boolean flags are typed from the default — read `.value`:

```ts
readonly maxUploads = flagSignal('max_uploads', 10);             // Signal<{ value: number, ... }>
readonly mode       = flagSignal('pipeline_mode', 'stable');     // string
readonly limits     = flagSignal('rate_limit', { window: 60 });  // json
// template: {{ maxUploads().value }}
```

**After creating the file, tell the user:**

> I've added a feature flag demo component. Route to it (or drop `<app-flags-demo>`
> in a page), open it in the browser, then go to **Feature Control** in the Bridge
> dashboard and toggle **demo-flag** on — the box turns green without a page refresh.

## 4. Where to put eval context

Flags don't require auth. But if you have your own user model, pass an eval context
so rules can target it. Both the component and `flagSignal` accept a `context`:

```ts
// flagSignal
readonly enterprise = flagSignal('enterprise-feature', false, {
  identity: this.user.id,                 // stable per-user id — required for % rollouts
  attributes: { plan: this.user.plan },   // anything your rules target on
});
```
```html
<!-- component -->
<bridge-feature-flag
  key="enterprise-feature"
  [defaultValue]="false"
  [context]="{ attributes: { plan: plan() } }"
>
  <app-enterprise />
  <p *bridgeFeatureFlagFallback>Upgrade to unlock</p>
</bridge-feature-flag>
```

Per-call attributes win on key collision over Bridge-managed providers.

> **Percentage rollouts need `identity`.** If a rule rolls out to a percentage and no
> identity is on the context, the SDK refuses to bucket and returns the safe default —
> it never randomizes per call.

## 5. What to expect in the dashboard

The first time any flag key is evaluated, Bridge **auto-creates it as off** and it
appears at **app.thebridge.dev/flags** (Feature Control). From there you flip it on,
set an `on-with-rule` rule (target by attribute, percentage rollout), or change its
value live. Connected clients pick up the change over the realtime channel within
seconds — no redeploy, no refresh.

## 6. Standalone vs full-platform

- **Standalone flags:** pass your own `{ identity, attributes }` as shown above.
- **With Bridge Auth:** if the app also uses Bridge Auth (same `provideBridge()`),
  the signed-in user's `role` and `plan` merge into the eval context automatically
  via the auth attribute provider — your rules can target `user.role` / `tenant.plan`
  with no extra wiring. (You can also gate whole routes on a flag via the
  `featureFlag` field in `provideBridge`'s `RouteGuardConfig`.)

## 7. Troubleshooting

Flag not showing in the dashboard within ~30s, or a flag always reads its default:

- **App id.** Confirm `bridgeConfig.appId` is set (from `environment.ts`). A flag is
  only registered once it's been evaluated for a real workspace.
- **`provideBridge()` registered.** It must be in `appConfig.providers`. Without it
  the core runtime never boots and every flag read returns the default.
- **Injection context.** `flagSignal(...)` must be called from an injection context
  (component field initializer or constructor) — calling it from a lifecycle hook or
  plain callback throws.
- **Realtime / live channel.** Live toggles ride the realtime channel; if a corporate
  proxy blocks WebSockets the value still resolves on next load, just not instantly.
- **First-render flicker is expected** — flags hydrate async. Set `[defaultValue]` to
  a safe-off state.
