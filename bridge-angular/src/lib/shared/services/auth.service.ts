import { Injectable, computed, signal } from '@angular/core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { logger } from '../logger';
import type { BridgeConfig, TokenSet } from '../../types/config';

const TOKEN_KEY = 'bridge_tokens';
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _tokens = signal<TokenSet | null>(null);
  private readonly _isLoading = signal(true);
  private readonly _error = signal<string | null>(null);

  readonly tokens = this._tokens.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isAuthenticated = computed(() => !!this._tokens()?.accessToken);

  private refreshInterval: ReturnType<typeof setTimeout> | null = null;

  constructor(private configService: BridgeConfigService) {
    // Load from localStorage on init
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(TOKEN_KEY);
        if (raw) this._tokens.set(JSON.parse(raw));
      } catch (e) {
        logger.error('Failed to load tokens from storage', e);
      } finally {
        this._isLoading.set(false);
      }
    } else {
      this._isLoading.set(false);
    }
  }

  // --- Token management ---

  private setTokens(tokens: TokenSet): void {
    logger.debug('[auth] setTokens called', {
      hasAccessToken: !!tokens?.accessToken,
      hasRefreshToken: !!tokens?.refreshToken,
      hasIdToken: !!tokens?.idToken,
    });
    this._tokens.set(tokens);
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
      logger.debug('[auth] tokens stored in localStorage');
    }
    this.scheduleTokenRefresh();
  }

  private clearTokens(): void {
    this._tokens.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
    this.stopAutoRefresh();
  }

  // --- Public API ---

  async login(options: { redirectUri?: string } = {}): Promise<void> {
    const loginUrl = this.createLoginUrl(options);
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    } else {
      throw new Error('Login not supported in this environment');
    }
  }

  async logout(): Promise<void> {
    this.clearTokens();
    if (typeof window !== 'undefined') {
      const config = this.configService.getConfig();
      const logoutUrl = `${config.authBaseUrl}/url/logout/${config.appId}`;
      window.location.href = logoutUrl;
    }
  }

  createLoginUrl(options: { redirectUri?: string } = {}): string {
    const config = this.configService.getConfig();
    const redirectUri = options.redirectUri ?? config.callbackUrl;
    const base = `${config.authBaseUrl}/url/login/${config.appId}`;
    return redirectUri
      ? `${base}?cv_env=bridge&redirect_uri=${encodeURIComponent(redirectUri)}`
      : base;
  }

  async handleCallback(code: string): Promise<void> {
    logger.debug('[auth] handleCallback called with code:', code ? 'present' : 'missing');
    const config: BridgeConfig = this.configService.getConfig();
    const url = `${config.authBaseUrl}/token/code/${config.appId}`;

    logger.debug('[auth] exchanging code for tokens', {
      url,
      appId: config.appId,
      callbackUrl: config.callbackUrl,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        ...(config.callbackUrl
          ? { redirect_uri: config.callbackUrl, redirectUri: config.callbackUrl }
          : {}),
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to exchange code for tokens';
      try {
        const errorData = await response.json();
        if (errorData?.message) {
          errorMessage = `Failed to exchange code for tokens: ${errorData.message}`;
        }
      } catch {
        errorMessage = `Failed to exchange code for tokens: ${response.statusText || 'Unknown error'}`;
      }
      logger.error('[auth] handleCallback failed', errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    logger.debug('[auth] token exchange successful, setting tokens');
    this.setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
    });
  }

  async refreshToken(refreshTokenValue: string): Promise<TokenSet | null> {
    const config = this.configService.getConfig();
    try {
      const url = `${config.authBaseUrl}/token`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.appId,
          grant_type: 'refresh_token',
          refresh_token: refreshTokenValue,
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      const tokens: TokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
      };
      this.setTokens(tokens);
      return tokens;
    } catch (e) {
      logger.error('Failed to refresh token', e);
      return null;
    }
  }

  getToken(): TokenSet | null {
    return this._tokens();
  }

  // --- Auto-refresh ---

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.scheduleTokenRefresh();
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearTimeout(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async maybeRefreshNow(): Promise<boolean> {
    const current = this._tokens();
    const accessToken = current?.accessToken ?? null;
    const refresh = current?.refreshToken ?? null;
    if (!accessToken || !refresh) return !!accessToken;

    if (this.shouldRefreshNow(accessToken)) {
      const newTokens = await this.refreshToken(refresh);
      if (newTokens) return true;
      this.clearTokens();
      return false;
    }
    return true;
  }

  // --- Private helpers ---

  private getTokenExpiry(token: string): number | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000;
    } catch {
      return null;
    }
  }

  private shouldRefreshNow(accessToken: string | null): boolean {
    if (!accessToken) return false;
    const exp = this.getTokenExpiry(accessToken);
    if (!exp) return false;
    return exp - Date.now() <= REFRESH_THRESHOLD_MS;
  }

  private scheduleTokenRefresh(): void {
    if (typeof window === 'undefined') return;
    const current = this._tokens();
    const accessToken = current?.accessToken ?? null;
    const exp = accessToken ? this.getTokenExpiry(accessToken) : null;
    if (!exp) return;

    const timeUntilExpiry = exp - Date.now();
    logger.debug('[auth] timeUntilExpiry and refresh threshold', timeUntilExpiry, REFRESH_THRESHOLD_MS);

    if (this.shouldRefreshNow(accessToken)) {
      logger.debug('[auth] refreshing now');
      this.refreshNow();
    } else {
      const checkIn = Math.max(timeUntilExpiry - REFRESH_THRESHOLD_MS, 10000);
      this.refreshInterval = setTimeout(() => this.refreshNow(), checkIn);
    }
  }

  private async refreshNow(): Promise<void> {
    const current = this._tokens();
    if (!current?.refreshToken) return;

    logger.debug('🔄 Attempting token refresh...');
    const newTokens = await this.refreshToken(current.refreshToken);
    if (newTokens) {
      logger.debug('✅ Token refreshed');
    } else {
      logger.warn('❌ Token refresh failed');
      this.clearTokens();
    }
  }
}
