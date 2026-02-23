import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { logger } from '../../shared/logger';

@Component({
  selector: 'bridge-team-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="team-management-container">
      @if (isLoading) {
        <div class="loading">Loading team management...</div>
      } @else if (error) {
        <div class="error">
          <h3>Error</h3>
          <p>{{ error }}</p>
        </div>
      } @else if (iframeUrl) {
        <iframe
          [src]="iframeUrl"
          title="Team Management"
          class="team-management-iframe"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      }
    </div>
  `,
  styles: [`
    .team-management-container {
      width: 100%;
      height: 100%;
      min-height: 600px;
      position: relative;
    }

    .team-management-iframe {
      width: 100%;
      height: 100%;
      border: none;
      min-height: 600px;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 600px;
      color: #4b5563;
    }

    .error {
      padding: 1rem;
      background-color: #fee2e2;
      border: 1px solid #ef4444;
      border-radius: 0.25rem;
      color: #dc2626;
      margin: 1rem;
    }

    .error h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.125rem;
    }

    .error p {
      margin: 0;
    }
  `],
})
export class TeamManagementComponent implements OnInit {
  iframeUrl: SafeResourceUrl | null = null;
  error: string | null = null;
  isLoading = true;

  constructor(
    private authService: AuthService,
    private configService: BridgeConfigService,
    private sanitizer: DomSanitizer,
  ) {}

  async ngOnInit(): Promise<void> {
    logger.debug('[TeamManagement] ngOnInit started');
    try {
      const token = this.authService.getToken();
      logger.debug('[TeamManagement] token check:', {
        hasToken: !!token,
        hasAccessToken: !!token?.accessToken,
      });

      const accessToken = token?.accessToken;
      if (!accessToken) {
        throw new Error('No access token available. Please log in first.');
      }

      const url = await this.getHandoverCode(accessToken);
      this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      logger.debug('[TeamManagement] iframe URL set:', url);
    } catch (err) {
      logger.error('[TeamManagement] Error:', err);
      this.error =
        err instanceof Error ? err.message : 'Failed to load team management';
    } finally {
      this.isLoading = false;
      logger.debug('[TeamManagement] loading complete');
    }
  }

  private async getHandoverCode(accessToken: string): Promise<string> {
    const config = this.configService.getConfig();
    const authBaseUrl = config.authBaseUrl;
    const appId = config.appId;

    logger.debug('[TeamManagement] getHandoverCode called', { authBaseUrl, appId });

    const response = await fetch(`${authBaseUrl}/handover/code/${appId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        redirectUri:
          config.callbackUrl ||
          `${window.location.origin}/auth/oauth-callback`,
      }),
    });

    logger.debug('[TeamManagement] handover response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get handover code: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();

    if (!data.code) {
      throw new Error('Failed to get handover code: No code in response');
    }

    const baseUrl = config.teamManagementUrl;
    const url = `${baseUrl}?code=${data.code}`;
    logger.debug('[TeamManagement] constructed iframe URL:', url);
    return url;
  }
}
