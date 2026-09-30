/**
 * PasskeyLogin — Angular port of bridge-svelte's `sdk-auth/PasskeyLogin.svelte`.
 *
 * Signs in with a WebAuthn passkey: options from Bridge
 * (`getPasskeyAuthOptions`), the browser's authenticator, and the signed answer
 * back to Bridge (`authenticateWithPasskey(response)`). Mirrors react's
 * `PasskeyLogin.tsx`: `data-bridge-passkey-login` + `data-loading`; when the
 * authenticator finds no passkey it emits `setupPasskey` or navigates to
 * `setupHref`. Hidden where the browser cannot run a passkey ceremony.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { authErrorMessage, displayError } from './shared/auth-error';
import { AuthSpinnerComponent } from './shared/spinner.component';
import { passkeysSupported, startPasskeyAuthentication } from '../../core/webauthn';

@Component({
  selector: 'bridge-passkey-login',
  standalone: true,
  imports: [AuthSpinnerComponent],
  template: `
    @if (supported) {
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
        <span>{{ label ?? t('passkey.loginButton') }}</span>
      </button>
    }
  `,
})
export class PasskeyLoginComponent extends TranslatableComponent {
  @Input() setupHref?: string;
  /** Button label. Defaults to the catalogue's `passkey.loginButton`. */
  @Input() label?: string;
  /** Offer passkeys in the browser's autofill (conditional mediation). */
  @Input() autofill = false;
  @Input() className = '';
  @Input() style = '';
  @Output() login = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();
  @Output() setupPasskey = new EventEmitter<void>();

  private readonly authService = inject(AuthService);
  protected readonly loading = signal(false);
  /** Hidden where the browser cannot run a passkey ceremony (as bridge-svelte). */
  protected readonly supported = passkeysSupported();

  // TBP-744 / TBP-515 — the real ceremony: options from Bridge, the
  // authenticator in the browser, the signed answer back to Bridge. This used
  // to call `authenticateWithPasskey()` with no answer at all, so no
  // authenticator was ever asked and the sign-in could not succeed.
  async handleClick(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      const auth = this.authService.getBridgeAuth();
      const options = await auth.getPasskeyAuthOptions();
      const response = await startPasskeyAuthentication(options, this.autofill);
      await auth.authenticateWithPasskey(response);
      this.login.emit();
    } catch (err: any) {
      // The authenticator refused or found no passkey: offer to create one.
      if (err?.name === 'NotAllowedError') {
        if (this.setupPasskey.observed) {
          this.setupPasskey.emit();
          return;
        }
        if (this.setupHref && typeof window !== 'undefined') {
          window.location.href = this.setupHref;
          return;
        }
        this.error.emit(new Error(this.t('passkey.error.authCancelled')));
        return;
      }
      this.error.emit(displayError(err, authErrorMessage(err, this.translate, 'passkey.error.auth')));
    } finally {
      this.loading.set(false);
    }
  }
}
