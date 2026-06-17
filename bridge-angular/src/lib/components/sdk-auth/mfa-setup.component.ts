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
import { AuthService } from '../../shared/services/auth.service';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-mfa-setup',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper
      heading="Set up two-factor authentication"
      [className]="className"
      [style]="style"
    >
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (step() === 'phone') {
        <p class="bridge-step-desc">
          Enter your phone number to receive a verification code via SMS.
        </p>
        <form (ngSubmit)="handleSendCode()">
          <div class="bridge-form-group">
            <label for="mfa-phone">Phone number</label>
            <input
              id="mfa-phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
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
              Send code
            }
          </button>
        </form>
      }

      @if (step() === 'verify') {
        <p class="bridge-step-desc">Enter the 6-digit code sent to your phone.</p>
        <form (ngSubmit)="handleVerifyCode()">
          <div class="bridge-form-group">
            <label for="mfa-verify-code">Verification code</label>
            <input
              id="mfa-verify-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="Enter 6-digit code"
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
              Verify
            }
          </button>
        </form>
        <p class="bridge-mfa-help">
          @if (resendCountdown() > 0) {
            Didn't get your text message? You can resend in {{ resendCountdown() }}s.
          } @else {
            Didn't get your text message?
            <button type="button" class="bridge-link" (click)="handleResendCode()" [disabled]="loading()">
              Resend code
            </button>
            .
          }
        </p>
        <button type="button" class="bridge-link" (click)="changePhone()">
          Change phone number
        </button>
      }

      @if (step() === 'backup') {
        <bridge-auth-alert variant="success">Two-factor authentication enabled!</bridge-auth-alert>
        <p class="bridge-step-desc">
          Save this recovery code in a safe place. You can use it to access your account if
          you lose your phone.
        </p>
        @if (backupCode()) {
          <div class="bridge-backup-code">
            <code>{{ backupCode() }}</code>
            <button type="button" class="bridge-btn bridge-btn-secondary" (click)="copyBackupCode()">
              {{ copied() ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        }
        <button type="button" class="bridge-btn bridge-btn-primary" (click)="handleDone()">
          Done
        </button>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class MfaSetupComponent implements OnDestroy {
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
      this.errorMsg.set(err.message || 'Failed to send verification code.');
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
      this.errorMsg.set(err.message || 'Failed to resend verification code.');
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
      this.errorMsg.set(err.message || 'Invalid code. Please try again.');
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
