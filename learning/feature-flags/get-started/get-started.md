# Get started

Bridge bootstraps flags automatically. `provideBridge(...)` wires an `APP_INITIALIZER` that mounts the realtime runtime and initializes Feature Flags 2.0 on the shared channel during app bootstrap — no flag-specific init call is needed:

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig } from '@nebulr-group/bridge-angular';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: import.meta.env.NG_APP_BRIDGE_APP_ID, // only appId is required for flags-only apps
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideBridge(bridgeConfig)],
};
```

Configuration comes from the same `provideBridge(config, routeConfig)` you already call — only `appId` is required for flags-only apps.
