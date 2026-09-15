/**
 * MfaSetup — Angular port of bridge-svelte's `sdk-auth/MfaSetup.svelte`.
 *
 * Shown when `authState() === 'mfa-setup-required'`. Three-step wizard: enter
 * phone (`setupMfa`) → verify code (`confirmMfaSetup`) → show + copy backup code
 * (`completeMfaSetup`). Mirrors react's `MfaSetup.tsx`.
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
import type { MessageKey, MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

// TBP-631 — the three step descriptions used to sit inline in the template,
// outside the wrapper's heading guard, so `[heading]="null"` could not reach
// them. They live in one wrapper rather than three, so the wrapper cannot know
// the step — the component computes it and hands over the resolved value.
const STEP_DESCRIPTION_KEYS: Record<'phone' | 'verify' | 'backup', MessageKey> = {
  phone: 'mfaSetup.phoneDescription',
  verify: 'mfaSetup.verifyDescription',
  backup: 'mfaSetup.backupDescription',
};

@Component({
  selector: 'bridge-mfa-setup',
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

      @if (step() === 'phone') {
        <form (ngSubmit)="handleSendCode()">
          <div class="bridge-form-group">
            <label for="mfa-phone">{{ t('field.phoneNumber') }}</label>
            <input
              id="mfa-phone"
              type="tel"
              [placeholder]="t('placeholder.phoneNumber')"
              [(ngModel)]="phoneNumber"
              name="phoneNumber"
              [disabled]="loading()"
            />
          </div>
          <button
            type="submit"
            class="bridge-btn bridge-btn-primary"
            [disabled]="loading() || !phoneNumber.trim()"
          >
            @if (loading()) {
              <bridge-auth-spinner [size]="16" />
            } @else {
              {{ t('mfaSetup.sendCode') }}
            }
          </button>
        </form>
      }

      @if (step() === 'verify') {
        <form (ngSubmit)="handleVerifyCode()">
          <div class="bridge-form-group">
            <label for="mfa-verify-code">{{ t('field.verificationCode') }}</label>
            <input
              id="mfa-verify-code"
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
              {{ t('mfaSetup.verify') }}
            }
          </button>
        </form>
        <p class="bridge-mfa-help">
          @if (resendCountdown() > 0) {
            {{ t('mfa.resendCountdown', { seconds: resendCountdown() }) }}
          } @else {
            {{ t('mfa.resendPrompt') }}
            <button type="button" class="bridge-link" (click)="handleResendCode()" [disabled]="loading()">
              {{ t('action.resendCode') }}
            </button>
            .
          }
        </p>
        <button type="button" class="bridge-link" (click)="changePhone()">
          {{ t('mfaSetup.changePhone') }}
        </button>
      }

      @if (step() === 'backup') {
        <bridge-auth-alert variant="success">{{ t('mfaSetup.successHeading') }}</bridge-auth-alert>
        @if (backupCode()) {
          <div class="bridge-backup-code">
            <code>{{ backupCode() }}</code>
            <button type="button" class="bridge-btn bridge-btn-secondary" (click)="copyBackupCode()">
              {{ copied() ? t('action.copied') : t('action.copy') }}
            </button>
          </div>
        }
        <button type="button" class="bridge-btn bridge-btn-primary" (click)="handleDone()">
          {{ t('action.done') }}
        </button>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class MfaSetupComponent extends TranslatableComponent implements OnDestroy {
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  /**
   * Step description. Pass `null`/`''` to render nothing and use your own
   * subtitle (TBP-631).
   *
   * This component has THREE steps, each with its own description, but one
   * wrapper — so an override replaces whichever description is showing.
   */
  @Input() description?: string | null;
  @Input() className = '';
  @Input() style = '';
  @Output() complete = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  phoneNumber = '';
  code = '';
  protected readonly step = signal<'phone' | 'verify' | 'backup'>('phone');
  protected readonly backupCode = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly resendCountdown = signal(0);

  protected get wrapperHeading(): string | null {
    return this.heading !== undefined ? this.heading : this.t('mfaSetup.heading');
  }

  // `undefined` = not overridden (use the built-in); `null` = host suppressed it.
  protected get wrapperDescription(): string | null {
    if (this.description !== undefined) return this.description;
    return this.t(STEP_DESCRIPTION_KEYS[this.step()]);
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

  async handleSendCode(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).setupMfa(this.phoneNumber);
      this.step.set('verify');
      this.startCountdown();
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'mfaSetup.error.sendCode'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  async handleResendCode(): Promise<void> {
    if (this.loading() || this.resendCountdown() > 0) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).setupMfa(this.phoneNumber);
      this.code = '';
      this.startCountdown();
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'mfaSetup.error.resend'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  async handleVerifyCode(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      const result = await (this.authService.getBridgeAuth() as any).confirmMfaSetup(this.code);
      this.backupCode.set(result.backupCode ?? null);
      this.step.set('backup');
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'mfa.error.invalidCode'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }

  changePhone(): void {
    this.step.set('phone');
    this.code = '';
    this.errorMsg.set(null);
    this.resendCountdown.set(0);
    this.stopCountdown();
  }

  async copyBackupCode(): Promise<void> {
    const code = this.backupCode();
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async handleDone(): Promise<void> {
    await (this.authService.getBridgeAuth() as any).completeMfaSetup();
    this.complete.emit();
  }
}
