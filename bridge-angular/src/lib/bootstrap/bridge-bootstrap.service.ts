import { Injectable, Injector, signal } from '@angular/core';
import type { BridgeAuthConfig } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../config/bridge-config.service';
import { Router } from '@angular/router';
import {
  recheckBridgeRoute,
  routeRulesReferenceFlag,
  type RouteGuardConfig,
} from '../guards/route-guard';
import { AuthService } from '../shared/services/auth.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeService } from '../core/bridge.service';
import { logger, setLoggerConfigGetter } from '../shared/logger';
import type { BridgeConfig } from '../types/config';
import { setBridgeFetchAuth } from '../billing/bridge-http';
import { startBillingRefresh } from '../billing/billing-refresh';
import { loadBeforeFirstRender } from '../core/startup-reads';

const ROUTE_RECHECK_DEBOUNCE_MS = 50;

/**
 * Bootstraps Bridge during Angular's `APP_INITIALIZER`. This is the Angular
 * equivalent of bridge-svelte's `<BridgeBootstrap />` onMount / bridge-react's
 * `<BridgeProvider>`: it constructs the auth-core `BridgeAuth` singleton, mounts
 * the realtime runtime once, initializes Feature Flags 2.0 on top of the shared
 * RealtimeClient, and warms an already-authenticated session.
 *
 * TBP-810 — Angular waits for the app initializer before it renders anything,
 * so this is also where a signed-in page's plan features, billing state and
 * flag definitions are read (each capped at 1.5 s): a paying user never sees
 * "Upgrade to use this" flash on a plan-gated feature.
 */
@Injectable({ providedIn: 'root' })
export class BridgeBootstrapService {
  private readonly _ready = signal(false);
  readonly ready = this._ready.asReadonly();
  private _recheckTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
    private runtime: BridgeRuntimeService,
    private bridge: BridgeService,
    private injector: Injector,
  ) {}

  /**
   * TBP-654 — re-check the current route after an authorization change.
   * Debounced: a plan change arrives as a burst (plan_changed +
   * entitlements.changed + user.state_changed + the token refresh it causes),
   * and each re-check may cost a paywall status round-trip.
   */
  /**
   * TBP-575 — a flag changed. Re-check the current route only when the rule
   * that governs it names that flag: a route flag is a live kill switch, and a
   * flag nothing routes on must not cost a re-check.
   */
  private onFlagChanged(key: string): void {
    let config: RouteGuardConfig | undefined;
    try {
      config = this.configService.getRouteGuardConfig();
    } catch {
      return; // no route config — the guard is not in use
    }
    const router = this.injector.get(Router, null);
    const pathname = router ? router.url.split(/[?#]/)[0] : undefined;
    if (routeRulesReferenceFlag(key, config, pathname)) this.scheduleRouteRecheck();
  }

  private scheduleRouteRecheck(): void {
    if (this._recheckTimer) clearTimeout(this._recheckTimer);
    this._recheckTimer = setTimeout(() => {
      this._recheckTimer = undefined;
      recheckBridgeRoute(this.injector).catch((err) =>
        logger.warn('[BridgeBootstrapService] route re-check failed', err),
      );
    }, ROUTE_RECHECK_DEBOUNCE_MS);
  }

  async bootstrap(
    config: Partial<BridgeConfig> | string,
    routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' },
  ): Promise<void> {
    // 1. Initialize Bridge config (route guard rules, logger, derived URLs).
    this.configService.initConfig(config, routeConfig);
    setLoggerConfigGetter(() => this.configService.getConfig());
    logger.debug('[BridgeBootstrapService] config initialized');

    // 2. Construct the auth-core BridgeAuth singleton. It owns token storage
    //    (localStorage), profile, subscription, sdk-auth, team and its own
    //    background token refresh. Everything else rides on top of it.
    const merged = this.configService.getConfig();
    const authConfig: BridgeAuthConfig = {
      appId: merged.appId,
      apiBaseUrl: merged.apiBaseUrl,
      // TBP-744 — derived from apiBaseUrl on Bridge's domains, so a stage app's
      // hosted sign-in no longer opens on production.
      ...(merged.hostedUrl ? { hostedUrl: merged.hostedUrl } : {}),
      ...(merged.callbackUrl ? { callbackUrl: merged.callbackUrl } : {}),
      ...(merged.defaultRedirectRoute
        ? { defaultRedirectRoute: merged.defaultRedirectRoute }
        : {}),
      ...(merged.loginRoute ? { loginRoute: merged.loginRoute } : {}),
      debug: !!merged.debug,
    };
    this.authService.initBridge(authConfig);
    // TBP-744 — `bridgeFetch()` reads the token outside an injection context.
    setBridgeFetchAuth(this.authService);
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
      // TBP-654 / TBP-653 — a plan, entitlements, user-state or token change can
      // flip the verdict for the page the user is already on.
      this.runtime.onAuthorizationChange(() => this.scheduleRouteRecheck());
      // TBP-575 — a flag a route rule names was switched while the user is on
      // that route: move them off it, the way the guard would on navigation.
      this.runtime.onFlagChange((change) => this.onFlagChanged(change.key));
      // TBP-762 — the billing refresh rule: a renewed sign-in and tab focus
      // re-read the billing screens (live billing events are wired in the
      // runtime).
      startBillingRefresh(this.authService, (h) => this.runtime.onTokens(h));
      logger.debug('[BridgeBootstrapService] runtime started');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] failed to start runtime', err);
    }

    // 5. Initialize Feature Flags 2.0 on top of the shared RealtimeClient, then
    //    wire the auth-token → flag-context bridge so flag eval re-runs on
    //    login / logout / refresh.
    let definitionsLoaded: Promise<void> | undefined;
    try {
      const bundle = this.bridge.initFlags({
        // TBP-575 — flags that changed while the connection was down.
        onDefinitionsChanged: (keys) => {
          for (const key of keys) this.runtime.emitFlagChange({ key, kind: 'updated' });
        },
      });
      definitionsLoaded = bundle?.definitionsLoaded;
      this.runtime.onTokens((accessToken) => this.bridge.applyAuthContext(accessToken));
      logger.debug('[BridgeBootstrapService] feature flags 2.0 initialized');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] failed to initialize feature flags', err);
    }

    // 5b. TBP-810 — before the first render: the plan's features, the billing
    //     state and the flag definitions, all at once, each capped at 1.5 s.
    //     Signed out, only the flag definitions are awaited. Never rejects.
    await loadBeforeFirstRender(this.authService, definitionsLoaded);

    // 6. Mark ready.
    this.authService.markReady();
    this._ready.set(true);
    logger.debug('[BridgeBootstrapService] bootstrap complete');
  }
}
