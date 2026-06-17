/**
 * PasskeySetup — Angular port of bridge-svelte's `sdk-auth/PasskeySetup.svelte`.
 *
 * Registers a WebAuthn passkey from a token'd setup link via
 * `registerPasskeyWithToken(token)`. Mirrors react's `PasskeySetup.tsx`. Used by
 * the `/auth/setup-passkey/:token` route.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-passkey-setup',
  standalone: true,
  imports: [AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper heading="Set up your passkey" [className]="className" [style]="style">
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (done()) {
        <bridge-auth-alert variant="success">
          Passkey registered. You can now sign in without a password.
        </bridge-auth-alert>
        <div class="bridge-form-footer">
          <a [href]="loginHref">Continue to login</a>
        </div>
      } @else {
        <p class="bridge-step-desc">
          Click below to register a passkey with this device. You'll be able to sign in
          without a password from now on.
        </p>
        <button
          type="button"
          class="bridge-btn bridge-btn-primary"
          (click)="handleRegister()"
          [disabled]="loading()"
        >
          @if (loading()) {
            <bridge-auth-spinner [size]="16" />
          } @else {
            Register passkey
          }
        </button>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class PasskeySetupComponent {
  @Input({ required: true }) token!: string;
  @Input() loginHref = '/auth/login';
  @Input() className = '';
  @Input() style = '';
  @Output() complete = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly done = signal(false);

  async handleRegister(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).registerPasskeyWithToken(this.token);
      this.done.set(true);
      this.complete.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to register passkey.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
