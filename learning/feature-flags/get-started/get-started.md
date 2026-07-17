# Get started

Flags come with the SDK you already have: as long as your app registers
`provideBridge()`, the SDK wires everything up for you (the rule
cache, live updates, and telemetry). There is no separate flags client to
create and no flag-specific init call.

## 1. Set up the SDK

Add `provideBridge` to your application config so flags are always loaded:

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

// This is what activates flags: provideBridge() registers an APP_INITIALIZER
// that attaches the rule cache, live updates, and telemetry during bootstrap.
const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID,
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(bridgeConfig)],
};
```

Configuration comes from the same `provideBridge(config, routeConfig)`
call you already make in `app.config.ts`. Only `appId` is required for flags-only
apps.

## 2. Create a flag in Control Center

In Control Center (your admin dashboard at app.thebridge.dev), open Feature
Flags and create a boolean flag, for example `show_banner`, and leave it off.

## 3. Read the flag in a component

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

The second argument is the default: the value your app uses when the flag
isn't configured or Bridge is unreachable, so a flag check can never break
your app.

## 4. Flip it and watch it change live

With your app open in the browser, go back to Control Center and turn
`show_banner` on. The banner appears without a refresh, typically within
seconds: rule changes arrive over the live channel (a persistent realtime
connection the SDK maintains) and reactive reads like `bridge.flag` update in
place. Flip it off again and the banner disappears the same way.

That's the whole loop: create a flag, read it in code with a safe default,
and control it from Control Center from then on.

## Next steps

- [Show or hide UI](/feature-flags/using/show-hide-ui/) with the declarative `<bridge-feature-flag>` component
- [Use flags in your logic](/feature-flags/using/in-logic/) for branching code paths, not just markup
- [Guard routes](/feature-flags/using/guard-routes/) to gate whole pages behind a flag
- [Use flags on your backend](/feature-flags/using/backend/) so server and browser agree
