import { Injectable, signal } from '@angular/core';
import { BridgeConfigService } from '../config/bridge-config.service';
import { type RouteGuardConfig } from '../guards/route-guard';
import { FeatureFlagService } from '../shared/services/feature-flag.service';
import { AuthService } from '../shared/services/auth.service';
import { logger } from '../shared/logger';
import type { BridgeConfig } from '../types/config';

@Injectable({ providedIn: 'root' })
export class BridgeBootstrapService {
  private readonly _ready = signal(false);
  readonly ready = this._ready.asReadonly();

  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
    private featureFlagService: FeatureFlagService,
  ) {}

  async bootstrap(
    config: BridgeConfig | string,
    routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' },
  ): Promise<void> {
    const finalConfig =
      typeof config === 'string' ? { appId: config } : config;

    // 1. Initialize configuration
    this.configService.initConfig(finalConfig, routeConfig);
    logger.debug('[BridgeBootstrapService] config initialized');

    // 2. Refresh tokens if needed (no-op if not authenticated)
    try {
      await this.authService.maybeRefreshNow();
      logger.debug('[BridgeBootstrapService] token refresh check complete');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] token refresh check failed', err);
    }

    // 3. Load feature flags
    try {
      await this.featureFlagService.loadFeatureFlags();
      logger.debug('[BridgeBootstrapService] feature flags loaded');
    } catch (err) {
      logger.warn('[BridgeBootstrapService] failed to load feature flags', err);
    }

    // 4. Start auto-refresh
    this.authService.startAutoRefresh();
    logger.debug('[BridgeBootstrapService] auto-refresh started');

    // 5. Mark ready
    this._ready.set(true);
    logger.debug('[BridgeBootstrapService] bootstrap complete');
  }
}
