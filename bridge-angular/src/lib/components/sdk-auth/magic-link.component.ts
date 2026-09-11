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
import { TranslatableComponent } from '../../i18n/translator';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-magic-link',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper
      [heading]="sent() ? null : wrapperHeading"
      [description]="sent() ? null : wrapperDescription"
      [className]="className"
      [style]="style"
    >
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (sent()) {
        <bridge-auth-alert variant="success">
          {{ t('magicLink.sent', { expiry: expiryLabel() }) }}
        </bridge-auth-alert>
        @if (loginHref) {
          <div class="bridge-form-footer">
            <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
          </div>
        }
      } @else {
        <form (ngSubmit)="handleSend()">
          <div class="bridge-form-group">
            <label for="magic-email">{{ t('field.email') }}</label>
            <input
              id="magic-email"
              type="email"
              [placeholder]="t('placeholder.email')"
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
              {{ t('magicLink.submit') }}
            }
          </button>
        </form>
        @if (loginHref) {
          <div class="bridge-form-footer">
            <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
          </div>
        }
      }
    </bridge-auth-form-wrapper>
  `,
})
export class MagicLinkComponent extends TranslatableComponent {
  @Input() loginHref = '/auth/login';
  @Input() className = '';
  @Input() style = '';
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  /** Step description. Pass `null`/`''` to render nothing and use your own subtitle (TBP-631). */
  @Input() description?: string | null;
  @Output() sentEvent = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  email = '';
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly sent = signal(false);
  protected readonly expiryLabel = signal('');

  // `undefined` means "not passed" and falls through to the catalogue; `null` is
  // an explicit suppression from the host and must survive (TBP-631), which is
  // why these cannot collapse to `heading ?? t(...)`.
  protected get wrapperHeading(): string | null {
    return this.heading !== undefined ? this.heading : this.t('magicLink.heading');
  }

  protected get wrapperDescription(): string | null {
    return this.description !== undefined ? this.description : this.t('magicLink.description');
  }

  private formatExpiry(seconds: number): string {
    if (seconds >= 60) {
      const count = Math.floor(seconds / 60);
      return this.t(count === 1 ? 'magicLink.expiryMinute' : 'magicLink.expiryMinutes', { count });
    }
    return this.t('magicLink.expirySeconds', { count: seconds });
  }

  async handleSend(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      const result = await (this.authService.getBridgeAuth() as any).sendMagicLink(this.email);
      this.expiryLabel.set(this.formatExpiry(result.expiresIn));
      this.sent.set(true);
      this.sentEvent.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || this.t('magicLink.error.send'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
