import { Injectable, signal } from '@angular/core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { logger } from '../logger';
import { AuthService } from './auth.service';

const CACHE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  private readonly _flags = signal<Record<string, boolean>>({});
  private lastFetchTime = 0;

  readonly flags = this._flags.asReadonly();

  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
  ) {}

  async loadFeatureFlags(): Promise<void> {
    const tokens = this.authService.getToken();
    const appId = this.configService.getConfig().appId;
    const accessToken = tokens?.accessToken;
    const cloudViewsUrl = this.configService.getConfig().cloudViewsUrl;

    if (!appId) return;

    logger.debug(
      `[feature-flag] fetching flags with token: ${accessToken ? accessToken.substring(0, 10) + '...' : 'none'}`,
    );

    const url = `${cloudViewsUrl}/flags/bulkEvaluate/${appId}`;
    const body = accessToken ? { accessToken } : {};

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Failed to load feature flags');

    const data = await res.json();
    const flags = data.flags.reduce(
      (
        acc: Record<string, boolean>,
        { flag, evaluation }: { flag: string; evaluation?: { enabled: boolean } },
      ) => {
        acc[flag] = evaluation?.enabled ?? false;
        return acc;
      },
      {},
    );

    this._flags.set(flags);
    this.lastFetchTime = Date.now();
  }

  async isFeatureEnabled(flag: string, forceLive = false): Promise<boolean> {
    const tokens = this.authService.getToken();
    const appId = this.configService.getConfig().appId;
    const accessToken = tokens?.accessToken;
    const cloudViewsUrl = this.configService.getConfig().cloudViewsUrl;

    if (!appId) return false;

    logger.debug(`[feature-flag] is flag:${flag}: enabled: ${this._flags()[flag]}`);

    if (!forceLive && Date.now() - this.lastFetchTime < CACHE_VALIDITY_MS) {
      return this._flags()[flag] ?? false;
    }

    if (!forceLive) {
      await this.loadFeatureFlags();
      return this._flags()[flag] ?? false;
    }

    // Live check via single-flag endpoint
    const url = `${cloudViewsUrl}/flags/evaluate/${appId}/${flag}`;
    const body = accessToken ? { accessToken } : {};

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return this._flags()[flag] ?? false;
    const { enabled } = await res.json();
    this._flags.update((f) => ({ ...f, [flag]: enabled }));
    return enabled ?? false;
  }

  async refresh(): Promise<void> {
    await this.loadFeatureFlags();
  }
}
