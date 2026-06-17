import { Injectable, signal } from '@angular/core';
import type { BridgeAuthConfig } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../config/bridge-config.service';
import { type RouteGuardConfig } from '../guards/route-guard';
import { AuthService } from '../shared/services/auth.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeService } from '../core/bridge.service';
import { logger, setLoggerConfigGetter } from '../shared/logger';
import type { BridgeConfig } from '../types/config';

/**
 * Bootstraps Bridge during Angular's `APP_INITIALIZER`. This is the Angular
 * equivalent of bridge-svelte's `<BridgeBootstrap />` onMount / bridge-react's
 * `<BridgeProvider>`: it constructs the auth-core `BridgeAuth` singleton, mounts
 * the realtime runtime once, initializes Feature Flags 2.0 on top of the shared
 * RealtimeClient, and warms an already-authenticated session.
 */
@Injectable({ providedIn: 'root' })
export class BridgeBootstrapService {
  private readonly _ready = signal(false);
  readonly ready = this._ready.asReadonly();

  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
    private runtime: BridgeRuntimeService,
    private bridge: BridgeService,
  ) {}

  async bootstrap(
    config: BridgeConfig | string,
    routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' },
  ): Promise<void> {
    const finalConfig = typeof config === 'string' ? { appId: config } : config;

    // 1. Initialize Bridge config (route guard rules, logger, derived URLs).
    this.configService.initConfig(finalConfig, routeConfig);
    setLoggerConfigGetter(() => this.configService.getConfig());
    logger.debug('[BridgeBootstrapService] config initialized');

    // 2. Construct the auth-core BridgeAuth singleton. It owns token storage
    //    (localStorage), profile, subscription, sdk-auth, team and its own
    //    background token refresh. Everything else rides on top of it.
    const merged = this.configService.getConfig();
    const authConfig: BridgeAuthConfig = {
      appId: merged.appId,
      apiBaseUrl: merged.apiBaseUrl,
      ...(merged.callbackUrl ? { callbackUrl: merged.callbackUrl } : {}),
      ...(merged.defaultRedirectRoute
        ? { defaultRedirectRoute: merged.defaultRedirectRoute }
        : {}),
      ...(merged.loginRoute ? { loginRoute: merged.loginRoute } : {}),
      debug: !!merged.debug,
    };
    this.authService.initBridge(authConfig);
    logger.debug('[BridgeBootstrapService] BridgeAuth initialized');

    // 3. Refresh tokens for an already-authenticated session (no-op otherwise).
    try {
      await this.authService.maybeRefreshNow();
      logger.debug('[BridgeBootstrapService] token refresh check complete');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] token refresh check failed', err);
    }

    // 4. Mount the realtime runtime (realtime client + session.snapshot fanout
    //    + billing-store binding + token-driven channel scoping). The Angular
    //    equivalent of svelte's <BridgeBootstrap /> mounting startBridgeRuntime.
    try {
      this.runtime.start();
      logger.debug('[BridgeBootstrapService] runtime started');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] failed to start runtime', err);
    }

    // 5. Initialize Feature Flags 2.0 on top of the shared RealtimeClient, then
    //    wire the auth-token → flag-context bridge so flag eval re-runs on
    //    login / logout / refresh.
    try {
      this.bridge.initFlags();
      this.runtime.onTokens((accessToken) => this.bridge.applyAuthContext(accessToken));
      logger.debug('[BridgeBootstrapService] feature flags 2.0 initialized');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] failed to initialize feature flags', err);
    }

    // 6. Mark ready.
    this.authService.markReady();
    this._ready.set(true);
    logger.debug('[BridgeBootstrapService] bootstrap complete');
  }
}
