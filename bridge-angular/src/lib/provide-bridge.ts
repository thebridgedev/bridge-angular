import { APP_INITIALIZER, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { BridgeBootstrapService } from './bootstrap/bridge-bootstrap.service';
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
  ]);
}
