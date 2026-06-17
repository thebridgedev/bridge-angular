/**
 * PasskeyLogin — Angular port of bridge-svelte's `sdk-auth/PasskeyLogin.svelte`.
 *
 * Authenticates with a WebAuthn passkey via
 * `getBridgeAuth().authenticateWithPasskey()`. Mirrors react's `PasskeyLogin.tsx`:
 * `data-bridge-passkey-login` + `data-loading`; on `no_passkey` it emits
 * `setupPasskey` or navigates to `setupHref`.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-passkey-login',
  standalone: true,
  imports: [AuthSpinnerComponent],
  template: `
    <button
      type="button"
      [class]="className"
      [style]="style"
      data-bridge-passkey-login
      [attr.data-loading]="loading()"
      [disabled]="loading()"
      (click)="handleClick()"
    >
      @if (loading()) {
        <bridge-auth-spinner [size]="16" />
      }
      <span>{{ label }}</span>
    </button>
  `,
})
export class PasskeyLoginComponent {
  @Input() setupHref?: string;
  @Input() label = 'Continue with passkey';
  @Input() className = '';
  @Input() style = '';
  @Output() login = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();
  @Output() setupPasskey = new EventEmitter<void>();

  private readonly authService = inject(AuthService);
  protected readonly loading = signal(false);

  async handleClick(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      const result = await (this.authService.getBridgeAuth() as any).authenticateWithPasskey();
      if (result?.type === 'auth_success' || result === undefined) {
        this.login.emit();
      } else if (result?.type === 'no_passkey') {
        if (this.setupPasskey.observed) {
          this.setupPasskey.emit();
        } else if (this.setupHref && typeof window !== 'undefined') {
          window.location.href = this.setupHref;
        }
      } else if (result?.type === 'auth_error') {
        throw new Error(result.error || 'Passkey login failed');
      }
    } catch (err: any) {
      this.error.emit(new Error(err.message || 'Passkey login failed'));
    } finally {
      this.loading.set(false);
    }
  }
}
