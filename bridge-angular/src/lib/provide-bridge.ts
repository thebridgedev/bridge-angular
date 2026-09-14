import {
  APP_BOOTSTRAP_LISTENER,
  APP_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { BridgeBootstrapService } from './bootstrap/bridge-bootstrap.service';
import { RealtimeDevBadgeMounter } from './components/developer/realtime-dev-badge.mounter';
import type { RouteGuardConfig } from './guards/route-guard';
import type { BridgeConfig } from './types/config';

/**
 * Provides Bridge authentication, feature flags, and route guard configuration.
 *
 * Usage in app.config.ts:
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideRouter(routes),
 *     provideBridge(bridgeConfig, routeConfig),
 *   ],
 * };
 * ```
 */
export function provideBridge(
  config: BridgeConfig | string,
  routeConfig?: RouteGuardConfig,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      useFactory: (bootstrapService: BridgeBootstrapService) => () =>
        bootstrapService.bootstrap(config, routeConfig),
      deps: [BridgeBootstrapService],
      multi: true,
    },
    // TBP-644 — the dev-only "Live updates off — why?" badge, mounted once the
    // root component exists so apps get it without template changes. The
    // mounter is a no-op in production (`isDevMode()`), on the server, and
    // with `devBadge: false`.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (mounter: RealtimeDevBadgeMounter) => () => mounter.mount(),
      deps: [RealtimeDevBadgeMounter],
      multi: true,
    },
  ]);
}
