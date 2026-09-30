import {
  APP_BOOTSTRAP_LISTENER,
  APP_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { BridgeBootstrapService } from './bootstrap/bridge-bootstrap.service';
import { RealtimeDevBadgeMounter } from './components/developer/realtime-dev-badge.mounter';
import { UpgradeDialogMounter } from './components/subscription/upgrade-dialog.mounter';
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
 *     provideHttpClient(withInterceptors([bridgeInterceptor])),
 *     provideBridge({ appId: environment.bridgeAppId, loginRoute: '/auth/login' }),
 *   ],
 * };
 * ```
 *
 * Configuration precedence (TBP-744, the same chain as every Bridge plugin with
 * the environment step empty — Angular has no env-var convention): an option
 * passed here > the built-in default. An empty string counts as unset. With no
 * `appId` it throws, naming the option. `hostedUrl` follows `apiBaseUrl` on
 * Bridge's own domains.
 */
export function provideBridge(
  config: Partial<BridgeConfig> | string,
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
    // TBP-744 — the upgrade dialog: opens on a plan-limit / plan-feature 402
    // seen by `bridgeInterceptor` or `bridgeFetch`, a plan-gated route, or a
    // `<bridge-feature-flag upgrade>` click. `billing.upgradeDialog: false`
    // turns it off; a component there replaces it.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (mounter: UpgradeDialogMounter) => () => mounter.mount(),
      deps: [UpgradeDialogMounter],
      multi: true,
    },
  ]);
}
