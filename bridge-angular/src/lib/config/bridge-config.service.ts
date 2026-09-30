import { Injectable, computed, isDevMode, signal } from '@angular/core';
import type { RouteGuardConfig } from '../guards/route-guard';
import { logger, setLoggerConfigGetter } from '../shared/logger';
import type { BridgeConfig } from '../types/config';
import { configWarnings, resolveBridgeConfig } from './resolve-config';

interface ConfigState {
  config: BridgeConfig | null;
  routeConfig: RouteGuardConfig | null;
  loaded: boolean;
}

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  authBaseUrl: 'https://api.thebridge.dev/auth',
  cloudViewsUrl: 'https://api.thebridge.dev/cloud-views',
  defaultRedirectRoute: '/',
  debug: false,
  // NOTE: `loginRoute` is intentionally NOT defaulted. Mirroring bridge-svelte,
  // an unset `loginRoute` means "hosted mode" — the route guard redirects to the
  // hosted auth portal (`createLoginUrl()`). Only when the consumer explicitly
  // sets `loginRoute` does the guard redirect to that in-app login view.
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

  initConfig(config: Partial<BridgeConfig> | string, routeConfig?: RouteGuardConfig): void {
    // TBP-744 — explicit option > default; an empty value is unset; the hosted
    // pages follow the API address. Throws, naming the option, with no app id.
    const resolved = resolveBridgeConfig(config);
    if (isDevMode()) {
      for (const warning of configWarnings(typeof config === 'string' ? {} : config, resolved)) {
        logger.warn(warning);
      }
    }

    const DEFAULT_CALLBACK_PATH = '/auth/oauth-callback';
    const defaultCallback =
      typeof window !== 'undefined'
        ? `${window.location.origin}${DEFAULT_CALLBACK_PATH}`
        : undefined;

    const merged: BridgeConfig = {
      ...DEFAULT_CONFIG,
      callbackUrl: defaultCallback,
      ...resolved,
    };

    if (resolved.callbackUrl) {
      merged.callbackUrl = resolved.callbackUrl;
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
