/**
 * ForgotPassword — Angular port of bridge-svelte's `sdk-auth/ForgotPassword.svelte`.
 *
 * Dual-mode: without a `token` it requests a reset link
 * (`sendResetPasswordLink(email)`); with a `token` it sets a new password
 * (`updatePassword(token, password)`). Mirrors react's `ForgotPassword.tsx`.
 * Used by both `/auth/forgot-password` and `/auth/set-password/:token`.
 */
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-forgot-password',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper
      [heading]="wrapperHeading"
      [description]="wrapperDescription"
      [className]="className"
      [style]="style"
    >
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (isSetMode()) {
        @if (passwordReset()) {
          <h2 class="bridge-success-heading">{{ t('forgot.successHeading') }}</h2>
          <div class="bridge-form-footer">
            <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
          </div>
        } @else {
          <form (ngSubmit)="handleSetPassword()">
            <div class="bridge-form-group">
              <label for="newPassword">{{ t('field.newPassword') }}</label>
              <div class="bridge-password-wrapper">
                <input
                  id="newPassword"
                  [type]="showPasswords() ? 'text' : 'password'"
                  [placeholder]="t('placeholder.newPassword')"
                  required
                  [(ngModel)]="password"
                  name="newPassword"
                  [disabled]="loading()"
                />
                <button
                  type="button"
                  class="bridge-password-toggle"
                  (click)="togglePasswords()"
                  tabindex="-1"
                  [attr.aria-label]="showPasswords() ? t('action.hidePasswords') : t('action.showPasswords')"
                >
                  {{ showPasswords() ? '🙈' : '👁' }}
                </button>
              </div>
            </div>
            <div class="bridge-form-group">
              <label for="confirmPassword">{{ t('field.confirmPassword') }}</label>
              <input
                id="confirmPassword"
                [type]="showPasswords() ? 'text' : 'password'"
                [placeholder]="t('placeholder.confirmPassword')"
                required
                [(ngModel)]="confirmPassword"
                name="confirmPassword"
                [disabled]="loading()"
              />
            </div>
            <button
              type="submit"
              class="bridge-btn bridge-btn-primary"
              [disabled]="loading() || !password"
            >
              @if (loading()) {
                <bridge-auth-spinner [size]="16" />
              } @else {
                {{ t('forgot.setSubmit') }}
              }
            </button>
          </form>
        }
      } @else if (emailSent()) {
        <bridge-auth-alert variant="success">{{ t('forgot.emailSent') }}</bridge-auth-alert>
        <div class="bridge-form-footer">
          <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
        </div>
      } @else {
        <form (ngSubmit)="handleSendLink()">
          <div class="bridge-form-group">
            <label for="reset-email">{{ t('field.email') }}</label>
            <input
              id="reset-email"
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
              {{ t('forgot.submit') }}
            }
          </button>
        </form>
        <div class="bridge-form-footer">
          <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
        </div>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class ForgotPasswordComponent extends TranslatableComponent {
  /** When provided, switches to "set new password" mode. */
  @Input() token?: string;
  @Input() loginHref = '/auth/login';
  @Input() className = '';
  @Input() style = '';
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  /** Step description. Pass `null`/`''` to render nothing and use your own subtitle (TBP-631). */
  @Input() description?: string | null;
  @Output() complete = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  protected readonly isSetMode = computed(() => !!this.token);

  email = '';
  password = '';
  confirmPassword = '';
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly emailSent = signal(false);
  protected readonly passwordReset = signal(false);
  protected readonly showPasswords = signal(false);

  // `undefined` means "not passed" and falls through to the catalogue; `null` is
  // an explicit suppression from the host and must survive (TBP-631), which is
  // why these cannot collapse to `heading ?? t(...)`.
  protected get wrapperHeading(): string | null {
    if (this.passwordReset() || this.emailSent()) return null;
    if (this.heading !== undefined) return this.heading;
    return this.isSetMode() ? this.t('forgot.headingSet') : this.t('forgot.headingRequest');
  }

  // TBP-631 — same shape as the heading: the description belongs to the
  // send-link step only.
  protected get wrapperDescription(): string | null {
    if (this.isSetMode() || this.passwordReset() || this.emailSent()) return null;
    if (this.description !== undefined) return this.description;
    return this.t('forgot.description');
  }

  togglePasswords(): void {
    this.showPasswords.update((v) => !v);
  }

  async handleSendLink(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await this.authService.getBridgeAuth().sendResetPasswordLink(this.email);
      this.emailSent.set(true);
    } catch (err: any) {
      this.errorMsg.set(err.message || this.t('forgot.error.send'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  async handleSetPassword(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);

    if (this.password !== this.confirmPassword) {
      this.errorMsg.set(this.t('forgot.error.mismatch'));
      return;
    }
    if (this.password.length < 8) {
      this.errorMsg.set(this.t('forgot.error.tooShort'));
      return;
    }

    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).updatePassword(this.token!, this.password);
      this.passwordReset.set(true);
      this.complete.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || this.t('forgot.error.update'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
