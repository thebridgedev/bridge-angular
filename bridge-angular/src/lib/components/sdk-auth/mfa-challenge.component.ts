/**
 * MfaChallenge — Angular port of bridge-svelte's `sdk-auth/MfaChallenge.svelte`.
 *
 * Shown when `authState() === 'mfa-required'`. Verifies a 6-digit code via
 * `verifyMfa(code)`, supports resend (`resendMfaCode`) with a countdown, and a
 * recovery-code fallback (`resetMfa(backupCode)`). Mirrors react's `MfaChallenge.tsx`.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; the resend countdown
 * uses a plain `setInterval` cleared in `ngOnDestroy`.
 */
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-mfa-challenge',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper [heading]="wrapperHeading" [className]="className" [style]="style">
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (!useRecovery()) {
        <form (ngSubmit)="handleVerify()">
          <div class="bridge-form-group">
            <label for="mfa-code">{{ t('field.authenticationCode') }}</label>
            <input
              id="mfa-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              [placeholder]="t('placeholder.sixDigitCode')"
              maxlength="6"
              [(ngModel)]="code"
              name="code"
              [disabled]="loading()"
            />
          </div>
          <button
            type="submit"
            class="bridge-btn bridge-btn-primary"
            [disabled]="loading() || code.length < 6"
          >
            @if (loading()) {
              <bridge-auth-spinner [size]="16" />
            } @else {
              {{ t('mfa.submit') }}
            }
          </button>
        </form>
        <p class="bridge-mfa-help">
          @if (resendCountdown() > 0) {
            {{ t('mfa.resendCountdown', { seconds: resendCountdown() }) }}
          } @else {
            {{ t('mfa.resendPrompt') }}
            <button type="button" class="bridge-link" (click)="handleResend()" [disabled]="loading()">
              {{ t('action.resendCode') }}
            </button>
            .
          }
        </p>
        @if (showRecoveryOption) {
          <div class="bridge-form-footer">
            <button type="button" class="bridge-link" (click)="enableRecovery()">
              {{ t('mfa.useRecoveryCode') }}
            </button>
          </div>
        }
      } @else {
        <form (ngSubmit)="handleRecovery()">
          <div class="bridge-form-group">
            <label for="backup-code">{{ t('field.recoveryCode') }}</label>
            <input
              id="backup-code"
              type="text"
              [placeholder]="t('placeholder.recoveryCode')"
              [(ngModel)]="backupCode"
              name="backupCode"
              [disabled]="loading()"
            />
          </div>
          <button
            type="submit"
            class="bridge-btn bridge-btn-primary"
            [disabled]="loading() || !backupCode.trim()"
          >
            @if (loading()) {
              <bridge-auth-spinner [size]="16" />
            } @else {
              {{ t('mfa.recoverSubmit') }}
            }
          </button>
        </form>
        <div class="bridge-form-footer">
          <button type="button" class="bridge-link" (click)="disableRecovery()">
            {{ t('mfa.useAuthenticationCode') }}
          </button>
        </div>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class MfaChallengeComponent extends TranslatableComponent implements OnDestroy {
  @Input() showRecoveryOption = true;
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  @Input() className = '';
  @Input() style = '';
  @Output() verified = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  code = '';
  backupCode = '';
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly useRecovery = signal(false);
  protected readonly resendCountdown = signal(0);

  protected get wrapperHeading(): string | null {
    return this.heading !== undefined ? this.heading : this.t('mfa.challengeHeading');
  }

  private intervalId: ReturnType<typeof setInterval> | null = null;

  private startCountdown(): void {
    this.stopCountdown();
    this.resendCountdown.set(60);
    this.intervalId = setInterval(() => {
      const next = this.resendCountdown() - 1;
      this.resendCountdown.set(next);
      if (next <= 0) this.stopCountdown();
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  enableRecovery(): void {
    this.useRecovery.set(true);
    this.errorMsg.set(null);
  }

  disableRecovery(): void {
    this.useRecovery.set(false);
    this.errorMsg.set(null);
  }

  async handleResend(): Promise<void> {
    if (this.loading() || this.resendCountdown() > 0) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).resendMfaCode();
      this.code = '';
      this.startCountdown();
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'mfa.error.resend'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  async handleVerify(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).verifyMfa(this.code);
      this.verified.emit();
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'mfa.error.invalidCode'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  async handleRecovery(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).resetMfa(this.backupCode);
      this.verified.emit();
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'mfa.error.invalidRecoveryCode'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
