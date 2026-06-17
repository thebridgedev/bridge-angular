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
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-forgot-password',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper
      [heading]="isSetMode() ? 'Set new password' : 'Reset your password'"
      [className]="className"
      [style]="style"
    >
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (isSetMode()) {
        @if (passwordReset()) {
          <h2 class="bridge-success-heading">Password set</h2>
          <div class="bridge-form-footer">
            <a [href]="loginHref">Back to login</a>
          </div>
        } @else {
          <form (ngSubmit)="handleSetPassword()">
            <div class="bridge-form-group">
              <label for="newPassword">New password</label>
              <div class="bridge-password-wrapper">
                <input
                  id="newPassword"
                  [type]="showPasswords() ? 'text' : 'password'"
                  placeholder="At least 8 characters"
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
                >
                  {{ showPasswords() ? '🙈' : '👁' }}
                </button>
              </div>
            </div>
            <div class="bridge-form-group">
              <label for="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                [type]="showPasswords() ? 'text' : 'password'"
                placeholder="Repeat password"
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
                Set a password
              }
            </button>
          </form>
        }
      } @else if (emailSent()) {
        <bridge-auth-alert variant="success">Check your email for a password reset link.</bridge-auth-alert>
        <div class="bridge-form-footer">
          <a [href]="loginHref">Back to login</a>
        </div>
      } @else {
        <p class="bridge-step-desc">
          Enter your email and we'll send you a link to reset your password.
        </p>
        <form (ngSubmit)="handleSendLink()">
          <div class="bridge-form-group">
            <label for="reset-email">Email</label>
            <input
              id="reset-email"
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
              Send reset link
            }
          </button>
        </form>
        <div class="bridge-form-footer">
          <a [href]="loginHref">Back to login</a>
        </div>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class ForgotPasswordComponent {
  /** When provided, switches to "set new password" mode. */
  @Input() token?: string;
  @Input() loginHref = '/auth/login';
  @Input() className = '';
  @Input() style = '';
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
      this.errorMsg.set(err.message || 'Failed to send reset link.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  async handleSetPassword(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);

    if (this.password !== this.confirmPassword) {
      this.errorMsg.set('Passwords do not match.');
      return;
    }
    if (this.password.length < 8) {
      this.errorMsg.set('Password must be at least 8 characters.');
      return;
    }

    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).updatePassword(this.token!, this.password);
      this.passwordReset.set(true);
      this.complete.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to update password.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
