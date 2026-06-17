/**
 * MagicLink — Angular port of bridge-svelte's `sdk-auth/MagicLink.svelte`.
 *
 * Sends a passwordless sign-in link via `getBridgeAuth().sendMagicLink(email)`.
 * Mirrors react's `MagicLink.tsx`: on success shows an expiry confirmation. The
 * actual token consumption happens in `<bridge-login-form>` (magic-link callback).
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

function formatExpiry(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    return `${m} minute${m !== 1 ? 's' : ''}`;
  }
  return `${seconds} seconds`;
}

@Component({
  selector: 'bridge-magic-link',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper heading="Sign in with email link" [className]="className" [style]="style">
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (sent()) {
        <bridge-auth-alert variant="success">
          Check your email — link expires in {{ expiryLabel() }}.
        </bridge-auth-alert>
        @if (loginHref) {
          <div class="bridge-form-footer">
            <a [href]="loginHref">Back to login</a>
          </div>
        }
      } @else {
        <p class="bridge-step-desc">
          Enter your email and we'll send you a sign-in link. No password needed.
        </p>
        <form (ngSubmit)="handleSend()">
          <div class="bridge-form-group">
            <label for="magic-email">Email</label>
            <input
              id="magic-email"
              type="email"
              placeholder="you@example.com"
              required
              [(ngModel)]="email"
              name="email"
              [disabled]="loading()"
            />
          </div>
          <button
            type="submit"
            class="bridge-btn bridge-btn-primary"
            [disabled]="loading() || !email.trim()"
          >
            @if (loading()) {
              <bridge-auth-spinner [size]="16" />
            } @else {
              Send magic link
            }
          </button>
        </form>
        @if (loginHref) {
          <div class="bridge-form-footer">
            <a [href]="loginHref">Back to login</a>
          </div>
        }
      }
    </bridge-auth-form-wrapper>
  `,
})
export class MagicLinkComponent {
  @Input() loginHref = '/auth/login';
  @Input() className = '';
  @Input() style = '';
  @Output() sentEvent = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  email = '';
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly sent = signal(false);
  protected readonly expiryLabel = signal('');

  async handleSend(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      const result = await (this.authService.getBridgeAuth() as any).sendMagicLink(this.email);
      this.expiryLabel.set(formatExpiry(result.expiresIn));
      this.sent.set(true);
      this.sentEvent.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to send magic link.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
