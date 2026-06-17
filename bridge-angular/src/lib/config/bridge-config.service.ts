import { Injectable, computed, signal } from '@angular/core';
import type { RouteGuardConfig } from '../guards/route-guard';
import { logger, setLoggerConfigGetter } from '../shared/logger';
import type { BridgeConfig } from '../types/config';

interface ConfigState {
  config: BridgeConfig | null;
  routeConfig: RouteGuardConfig | null;
  loaded: boolean;
}

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  authBaseUrl: 'https://api.thebridge.dev/auth',
  cloudViewsUrl: 'https://api.thebridge.dev/cloud-views',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false,
};

@Injectable({ providedIn: 'root' })
export class BridgeConfigService {
  private readonly _state = signal<ConfigState>({
    config: null,
    routeConfig: null,
    loaded: false,
  });

  readonly configReady = computed(() => this._state().loaded);
  readonly config = computed(() => this._state().config);

  initConfig(config: BridgeConfig, routeConfig?: RouteGuardConfig): void {
    if (!config?.appId) {
      throw new Error(
        'Bridge appId is required but was not provided in bridge configuration.',
      );
    }

    const DEFAULT_CALLBACK_PATH = '/auth/oauth-callback';
    const defaultCallback =
      typeof window !== 'undefined'
        ? `${window.location.origin}${DEFAULT_CALLBACK_PATH}`
        : undefined;

    const merged: BridgeConfig = {
      ...DEFAULT_CONFIG,
      callbackUrl: defaultCallback,
      ...config,
    };

    if (config.callbackUrl) {
      merged.callbackUrl = config.callbackUrl;
    } else if (!merged.callbackUrl && defaultCallback) {
      merged.callbackUrl = defaultCallback;
    }

    this._state.set({
      config: merged,
      routeConfig: routeConfig ?? null,
      loaded: true,
    });

    // Wire the logger to read debug from this service
    setLoggerConfigGetter(() => merged);

    logger.debug('[config] initialized', merged);
  }

  getConfig(): BridgeConfig {
    const state = this._state();
    if (!state.loaded || !state.config) {
      throw new Error(
        'Config has not been initialized. Call provideBridge() in your app config.',
      );
    }
    return state.config;
  }

  getRouteGuardConfig(): RouteGuardConfig {
    const state = this._state();
    if (!state.loaded || !state.routeConfig) {
      throw new Error(
        'RouteGuardConfig has not been initialized. Call provideBridge() with a routeConfig.',
      );
    }
    return state.routeConfig;
  }
}
