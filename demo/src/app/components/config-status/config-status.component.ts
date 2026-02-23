import { Component, OnInit, signal } from '@angular/core';
import { AuthService, BridgeConfigService } from '@nebulr-group/bridge-angular';
import { TokenStatusComponent } from '../token-status/token-status.component';

@Component({
  selector: 'app-config-status',
  standalone: true,
  imports: [TokenStatusComponent],
  template: `
    @if (error()) {
      <div class="feature-status">
        <p class="font-bold">❌ Config Error</p>
        <p>{{ error() }}</p>
        @if (error()?.includes('appId is required')) {
          <p>
            Please set the <code>bridgeAppId</code> in your environment configuration.
          </p>
        } @else {
          <p>Make sure Bridge config is initialized before using its features.</p>
        }
      </div>
    } @else if (appId()) {
      <div class="feature-status active">
        <p class="font-bold">✅ Success</p>
        <p>Bridge configuration initialized with appId: <code>{{ appId() }}</code></p>
      </div>
    }

    @if (isAuthenticated()) {
      <app-token-status />
    }
  `,
})
export class ConfigStatusComponent implements OnInit {
  protected readonly error = signal<string | null>(null);
  protected readonly appId = signal<string | null>(null);
  protected readonly isAuthenticated = this.authService.isAuthenticated;

  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    try {
      const config = this.configService.getConfig();
      this.appId.set(config.appId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }
}
