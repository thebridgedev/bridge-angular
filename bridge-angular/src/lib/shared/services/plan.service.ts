import { Injectable } from '@angular/core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { logger } from '../logger';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PlanService {
  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
  ) {}

  /**
   * Sets the security cookie required for Bridge redirects
   */
  async setSecurityCookie(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Plan redirects are only available in the browser');
    }

    const config = this.configService.getConfig();
    const cloudViewsUrl = config.cloudViewsUrl;

    if (!cloudViewsUrl) {
      throw new Error('cloudViewsUrl must be configured');
    }

    const tokenSet = this.authService.getToken();
    const token = tokenSet?.accessToken;

    if (!token) {
      throw new Error('No access token available. Please log in first.');
    }

    try {
      const response = await fetch(`${cloudViewsUrl}/security/setCookie`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to set security cookie: ${response.statusText}`);
      }

      logger.debug('[plan] Security cookie set successfully');
    } catch (error) {
      logger.error('[plan] Failed to set security cookie', error);
      throw error;
    }
  }

  /**
   * Redirects to Bridge's tenant plan selection page using the handover protocol
   */
  async redirectToPlanSelection(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Plan redirects are only available in the browser');
    }

    const config = this.configService.getConfig();
    const { authBaseUrl, cloudViewsUrl } = config;

    try {
      const tokenSet = this.authService.getToken();
      const accessToken = tokenSet?.accessToken;

      if (!accessToken) {
        throw new Error('No access token available. Please log in first.');
      }

      // Get handover code from Auth API
      const handoverResponse = await fetch(
        `${authBaseUrl}/handover/code/${config.appId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        },
      );

      if (!handoverResponse.ok) {
        throw new Error(
          `Failed to get handover code: ${handoverResponse.statusText}`,
        );
      }

      const { code } = await handoverResponse.json();

      if (!code) {
        throw new Error('Handover response did not contain a code');
      }

      const redirectUrl = `${cloudViewsUrl}/subscription-portal/selectPlan?code=${code}`;
      logger.debug('[plan] Redirecting to plan selection via handover', redirectUrl);
      window.location.href = redirectUrl;
    } catch (error) {
      logger.error('[plan] Failed to redirect to plan selection', error);
      throw error;
    }
  }
}
