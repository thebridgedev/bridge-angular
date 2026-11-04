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
        <span class="bridge-sso-btn-inner">
          @if (loading()) {
            <bridge-auth-spinner [size]="16" />
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" stroke-width="0.5" d="M3 20v-2.35c0-.63335.158335-1.175.475-1.625.316665-.45.725-.79165 1.225-1.025 1.11665-.5 2.1875-.875 3.2125-1.125S9.96665 13.5 11 13.5c.43335 0 .85415.02085 1.2625.0625s.82915.10415 1.2625.1875c-.08335.96665.09585 1.87915.5375 2.7375C14.50415 17.34585 15.15 18.01665 16 18.5v1.5H3Zm16 3.675-1.5-1.5v-4.65c-.73335-.21665-1.33335-.62915-1.8-1.2375-.46665-.60835-.7-1.3125-.7-2.1125 0-.96665.34165-1.79165 1.025-2.475.68335-.68335 1.50835-1.025 2.475-1.025s1.79165.34165 2.475 1.025c.68335.68335 1.025 1.50835 1.025 2.475 0 .75-.2125 1.41665-.6375 2-.425.58335-.9625 1-1.6125 1.25l1.25 1.25-1.5 1.5 1.5 1.5-2 2ZM11 11.5c-1.05 0-1.9375-.3625-2.6625-1.0875-.725-.725-1.0875-1.6125-1.0875-2.6625s.3625-1.9375 1.0875-2.6625C9.0625 4.3625 9.95 4 11 4s1.9375.3625 2.6625 1.0875c.725.725 1.0875 1.6125 1.0875 2.6625s-.3625 1.9375-1.0875 2.6625C12.9375 11.1375 12.05 11.5 11 11.5Zm7.5 3.175c.28335 0 .52085-.09585.7125-.2875S19.5 13.95835 19.5 13.675c0-.28335-.09585-.52085-.2875-.7125s-.42915-.2875-.7125-.2875c-.28335 0-.52085.09585-.7125.2875S17.5 13.39165 17.5 13.675c0 .28335.09585.52085.2875.7125s.42915.2875.7125.2875Z"/></svg>
          }
          <span>{{ label ?? t('passkey.loginButton') }}</span>
        </span>
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
