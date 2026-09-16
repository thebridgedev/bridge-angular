# Bridge Angular — Feature Flags

You are adding **Feature Flags** to an Angular application (standalone components, v19+) that uses The Bridge. The goal is to ship code behind a switch you control from the Bridge dashboard — no redeploy needed.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:

1. `@nebulr-group/bridge-angular` is in `package.json` dependencies
2. `src/app/app.config.ts` has `provideBridge(bridgeConfig)` in `appConfig.providers`
3. `bridgeConfig.appId` is set — usually read from `src/environments/environment.ts`
4. `src/main.ts` bootstraps with `bootstrapApplication(AppComponent, appConfig)`

If any are missing, run `bridge guide angular` first.

## Step 1 — Activate the flags layer

There is no `/flags` subpath and no separate flags provider — the Angular SDK ships one entry point, `@nebulr-group/bridge-angular`. `provideBridge()` registers an `APP_INITIALIZER` that starts the Bridge runtime and initializes the flag layer on it: local eval cache, hydration from the workspace, and realtime updates on the same channel as auth and billing.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  // Flags are evaluated against the Bridge API, so a non-production app needs
  // this too. It defaults to production: leave it out on a stage app and every
  // flag silently resolves against production instead.
  apiBaseUrl: environment.bridgeApiBaseUrl || undefined,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBridge(bridgeConfig),
  ],
};
```

Flags start evaluating for all visitors as soon as the app bootstraps — login is not required.

## Step 2 — Create the demo page

Create `src/app/flags-demo/flags-demo.component.ts` with the content below. It uses `<bridge-feature-flag>` to gate a visible box: grey with a striped border when the flag is off, solid green when it is on. The flag is auto-created in Bridge as off the first time the page renders.

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
    <div class="demo-page">
      <h1>Feature Flag Demo</h1>
      <p>Toggle <strong>demo-flag</strong> in the Bridge dashboard and watch this box change — no refresh needed.</p>

      <bridge-feature-flag key="demo-flag" [defaultValue]="false">
        <div class="flag-box flag-on">
          <div class="flag-icon">✓</div>
          <p><strong>demo-flag</strong> is <strong>enabled</strong></p>
          <p class="flag-hint">Go to Feature Control in the Bridge dashboard to toggle it off again.</p>
        </div>
        <div class="flag-box flag-off" *bridgeFeatureFlagFallback>
          <div class="flag-icon">⚑</div>
          <p>This box will turn green once you enable <strong>demo-flag</strong></p>
          <p class="flag-hint">Go to Feature Control in the Bridge dashboard and flip it on.</p>
        </div>
      </bridge-feature-flag>
    </div>
  `,
  styles: [`
    .demo-page { max-width: 480px; margin: 4rem auto; font-family: sans-serif; text-align: center; }
    .flag-box { margin: 2rem auto; padding: 2.5rem 2rem; border-radius: 10px; transition: background 0.4s ease; }
    .flag-off { background: linear-gradient(#f0f0f0, #f0f0f0) padding-box,
      repeating-linear-gradient(45deg, #aaa 0, #aaa 8px, transparent 8px, transparent 18px) border-box;
      border: 8px solid transparent; color: #555; }
    .flag-on { background: #d4edda; border: 4px solid #28a745; color: #155724; }
    .flag-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
    .flag-hint { font-size: 0.8rem; opacity: 0.65; margin-top: 0.5rem; }
  `],
})
export class FlagsDemoComponent {}
```

Register the route in `src/app/app.routes.ts`:

```ts
{ path: 'flags-demo', component: FlagsDemoComponent },
```

**After creating the file, tell the user:**

> I've created a feature flag demo page at `/flags-demo`. Open it in your browser, then go to **Feature Control** in the Bridge dashboard and toggle **demo-flag** on — the box will turn green without a page refresh.

## How `<bridge-feature-flag>` works

| Input | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | Flag key — auto-created in Bridge on first eval if it doesn't exist |
| `defaultValue` | `T` | no (default `false`) | Value used until the cache hydrates or if the flag doesn't exist |
| `context` | `Partial<EvalContext>` | no | Per-call eval context — see *Eval context* below |
| default slot | content | — | Rendered when the flag is on (`passed: true`) |
| `*bridgeFeatureFlagFallback` | content | — | Rendered when the flag is off (`passed: false`) |

Both `FeatureFlagComponent` and `BridgeFeatureFlagFallbackDirective` must be in the component's `imports`. Use the same component anywhere in the app to gate any content behind a flag.

## Step 3 — Configure how the flag decides (states and rules)

A flag has exactly **three states**. `off` and `on` apply to everyone; `on-with-rule` decides per visitor.

| State | Meaning |
|---|---|
| `off` | Everyone gets the off value. A newly auto-created flag starts here |
| `on` | Everyone gets the on value |
| `on-with-rule` | The rule decides. Whoever matches a branch gets that branch's value; everyone else gets `otherwiseValue` |

A rule is **branches + otherwiseValue + rolloutPct**, first match wins:

```jsonc
{
  "branches": [
    { "conditions": [ { "attribute": "tenant.plan", "operator": "in", "values": ["pro", "enterprise"] } ],
      "returnValue": true }
  ],
  "otherwiseValue": false,
  "rolloutPct": 100          // 0-100, applies to the WHOLE rule
}
```

- Conditions inside one branch are AND-ed; add more branches for OR / different return values.
- Operators: `eq` `neq` `contains` `not_contains` `in` `not_in` `gt` `lt` `between` `regex` `exists` `not_exists` (numeric and date operators only apply to those attribute types).
- `attribute` is a dotted path into the eval context (next step). With Bridge Auth, `user.id` `user.role` `user.email` `tenant.id` `tenant.plan` are populated for you.
- **`rolloutPct` below 100 requires an identity** on the eval context — bucketing is `hash(flagKey + identity) mod 100`. With no identity the SDK refuses to bucket and returns the safe value rather than randomizing per call.

Configure it either in the dashboard under **Feature Control**, or from the CLI — prefer the CLI when you are an agent, since it is scriptable and verifiable:

```bash
bridge flag create --key enterprise-export --value-type boolean --state on-with-rule \
  --rule '{"branches":[{"conditions":[{"attribute":"tenant.plan","operator":"in","values":["pro","enterprise"]}],"returnValue":true}],"otherwiseValue":false,"rolloutPct":100}'

# prove the rule does what you meant, without touching the app:
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=pro   # → true
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=free  # → false
```

`bridge flag list` / `get <key>` inspect the current state. To flip a flag without touching its rule, `bridge flag update` addresses it **by id, not by key** — read the id first:

```bash
bridge flag get <key>                      # id is in the output
bridge flag update --id <id> --state on    # or --state off | on-with-rule
```

## Step 4 — Feed the rule its inputs (eval context)

Rules can only target what the app sends. Flags don't require auth — without it you supply the context yourself:

```ts
{
  identity?: string;                    // stable per-user id — required when rolloutPct < 100
  attributes: Record<string, unknown>;  // dotted or nested; whatever your rules target
}
```

Per call, on the component:

```html
<bridge-feature-flag
  key="enterprise-export"
  [defaultValue]="false"
  [context]="{ identity: user.id, attributes: { 'tenant.plan': plan() } }"
>
  <app-export-button />
  <p *bridgeFeatureFlagFallback>Upgrade to unlock</p>
</bridge-feature-flag>
```

Or publish attributes once, app-wide, on the injectable `BridgeService`:

```ts
import { inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

const bridge = inject(BridgeService);

bridge.attributes.set('tenant.plan', plan);                  // static value
bridge.attributes.bind('seats', () => this.currentSeats);    // live — re-read on every eval
bridge.attributes.bindMany(() => ({ region, betaOptIn }));
```

Per-call context wins on key collision. **With Bridge Auth**, the signed-in user's role and plan flow in automatically (`user.role`, `tenant.plan`) — no wiring needed.

## Gating logic instead of markup

`<bridge-feature-flag>` gates *markup*. When the flag decides **behavior or supplies a value** — which endpoint to call, a numeric limit to enforce, a `string`/`number`/JSON flag value you compute with — read it as a signal instead:

```ts
import { inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

export class UploadComponent {
  private readonly bridge = inject(BridgeService);
  protected readonly limit = this.bridge.flag('upload-limit', 5); // Signal<{ value, passed }>
}
```

`flagSignal('upload-limit', 5)` is the same thing without injecting the service, and `bridge.evaluate(key, default, context?)` is the one-shot, non-reactive read. Create the signal **once**, as a field initializer or in the constructor — not per render or per event.

For anything this prompt doesn't cover — route-level flag guards (`featureFlag` on a `RouteGuardConfig` rule), multi-type flags, identity/anonymous bucketing, propagating context to your backend — read `learning/feature-flags/feature-flags.md` (and `learning/live-updates/live-updates.md` for the full attributes API) rather than guessing an API.

> Flags evaluate **client-side** in Angular today. There is no server-side evaluation in this SDK — the package ships a browser entry only, so don't try to read a flag during SSR/prerender.

## Troubleshooting

Flag not appearing in the dashboard within ~30s, or a read returns the default forever:

- **`provideBridge()` is in `appConfig.providers` and `appId` is set.** Its `APP_INITIALIZER` is what boots the flag layer; without it every read returns the default. An empty `environment.bridgeAppId` looks identical to "flag is off".
- **The component and the directive are both in `imports`.** Missing `FeatureFlagComponent` gives `NG0304: 'bridge-feature-flag' is not a known element`; missing `BridgeFeatureFlagFallbackDirective` makes the off-state slot render nothing at all.
- **`key` is a plain string input** — `key="demo-flag"` for a literal, `[key]="expr"` only for a bound value. Bracketing a literal (`[key]="demo-flag"`) makes Angular parse it as an expression instead of a string, and the component falls back to the default value.
- **A flag registers only once it has been evaluated** — load a route that actually renders the key.
- **Route guard hides the page.** With a `RouteGuardConfig` whose `defaultAccess` is `'protected'`, `/flags-demo` bounces to login before it can evaluate anything. Add `{ match: '/flags-demo', public: true }`.
- **Rule never matches?** Run `bridge flag eval <key> --identity … --attribute k=v` to see the verdict without the app in the way, then confirm the app sends those same attributes.
- **`rolloutPct < 100` with no identity** returns the safe value by design.
- **Realtime.** Live toggles ride the realtime channel; if a proxy blocks WebSockets the value still resolves on next load, just not instantly. `bridge.realtimeStatus()` is a signal you can read to check.
- **First-render flicker is expected** — flags hydrate async. Set `[defaultValue]` to the safe-off state.

## Verify

1. Navigate to `/flags-demo` in the browser. The grey striped box should appear — Bridge auto-creates `demo-flag` as off.
2. Go to **Feature Control** in the Bridge dashboard and toggle `demo-flag` on (or take the id from `bridge flag get demo-flag` and run `bridge flag update --id <id> --state on`).
3. The box turns green **without a page refresh** — realtime updates are on by default.
4. Toggle it off again to confirm it reverts.
