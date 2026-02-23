import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-token-status',
  standalone: true,
  template: `
    <div class="token-status">
      ⏳ Token expires in: {{ timeLeft() }}
      <button (click)="manualRefresh()">🔄 Refresh Now</button>
    </div>
  `,
})
export class TokenStatusComponent implements OnInit, OnDestroy {
  protected readonly timeLeft = signal('');
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.updateCountdown();
    this.interval = setInterval(() => this.updateCountdown(), 1000);
  }

  ngOnDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  manualRefresh(): void {
    const token = this.authService.getToken();
    if (token?.refreshToken) {
      this.authService.refreshToken(token.refreshToken);
    }
  }

  private getExpiry(): number | null {
    const token = this.authService.getToken()?.accessToken;
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000;
    } catch {
      return null;
    }
  }

  private format(ms: number): string {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}m ${sec}s`;
  }

  private updateCountdown(): void {
    const expiry = this.getExpiry();
    if (!expiry) {
      this.timeLeft.set('N/A');
      return;
    }
    const diff = expiry - Date.now();
    this.timeLeft.set(diff > 0 ? this.format(diff) : 'Expired');
  }
}
