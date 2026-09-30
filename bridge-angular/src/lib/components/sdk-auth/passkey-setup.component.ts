/**
 * PasskeySetup — Angular port of bridge-svelte's `sdk-auth/PasskeySetup.svelte`.
 *
 * Registers a WebAuthn passkey from an emailed setup link: registration
 * options for the link's token from Bridge, a new credential from the browser's
 * authenticator, and that credential back to Bridge to verify. Mirrors react's
 * `PasskeySetup.tsx`. Used by the `/auth/setup-passkey/:token` route.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';
import { passkeysSupported, startPasskeyRegistration } from '../../core/webauthn';

type SetupError = 'expired' | 'cancelled' | 'unsupported' | 'general';

function classifyError(err: any): SetupError {
  if (err?.name === 'NotAllowedError') return 'cancelled';
  const msg = String(err?.message ?? '').toLowerCase();
  if (msg.includes('expired') || msg.includes('invalid token') || msg.includes('not found')) return 'expired';
  return 'general';
}

@Component({
  selector: 'bridge-passkey-setup',
  standalone: true,
  imports: [AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper
      [heading]="wrapperHeading"
      [description]="wrapperDescription"
      [className]="className"
      [style]="style"
    >
      @if (errorMsg()) {
        <bridge-auth-alert [variant]="errorType() === 'unsupported' ? 'info' : 'error'">{{ errorMsg() }}</bridge-auth-alert>
      }
      @if (errorType() === 'expired' && expired.observed) {
        <button type="button" class="bridge-btn bridge-btn-secondary" (click)="expired.emit()">
          {{ t('passkey.requestNewLink') }}
        </button>
      }

      @if (done()) {
        <bridge-auth-alert variant="success">
          {{ t('passkey.setupSuccessDescription') }}
        </bridge-auth-alert>
        <div class="bridge-form-footer">
          <a [href]="loginHref">{{ t('passkey.signInNow') }}</a>
        </div>
      } @else {
        <button
          type="button"
          class="bridge-btn bridge-btn-primary"
          (click)="handleRegister()"
          [disabled]="loading()"
        >
          @if (loading()) {
            <bridge-auth-spinner [size]="16" />
          } @else {
            {{ t('passkey.setupSubmit') }}
          }
        </button>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class PasskeySetupComponent extends TranslatableComponent {
  @Input({ required: true }) token!: string;
  @Input() loginHref = '/auth/login';
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  /**
   * Step description. Pass `null`/`''` to render nothing and use your own
   * subtitle (TBP-631).
   *
   * The built-in is `passkey.setupClickPrompt`, not `passkey.setupDescription`:
   * this screen waits for a click before it raises the browser ceremony, so the
   * "follow the prompt from your browser" copy would be describing something
   * that has not started (TBP-633).
   */
  @Input() description?: string | null;
  @Input() className = '';
  @Input() style = '';
  @Output() complete = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();
  /** The link has expired: offer "Request new setup link" (as bridge-svelte). */
  @Output() expired = new EventEmitter<void>();

  private readonly authService = inject(AuthService);

  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly errorType = signal<SetupError | null>(null);
  protected readonly done = signal(false);

  protected get wrapperHeading(): string | null {
    if (this.heading !== undefined) return this.heading;
    return this.done() ? this.t('passkey.setupSuccessHeading') : this.t('passkey.setupHeading');
  }

  // Only the pre-click view has a description; the success view's copy is the
  // alert below it.
  protected get wrapperDescription(): string | null {
    if (this.done()) return null;
    if (this.description !== undefined) return this.description;
    return this.t('passkey.setupClickPrompt');
  }

  // TBP-744 / TBP-515 — the real ceremony: registration options for this
  // link's token from Bridge, the authenticator in the browser, the new
  // credential back to Bridge to verify. This used to call a
  // `registerPasskeyWithToken()` that auth-core does not have, so every
  // emailed setup link ended in "Passkey setup failed."
  async handleRegister(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.errorType.set(null);
    if (!passkeysSupported()) {
      this.errorType.set('unsupported');
      this.errorMsg.set(this.t('passkey.error.unsupported'));
      return;
    }
    this.loading.set(true);
    try {
      const auth = this.authService.getBridgeAuth();
      const options = await auth.getPasskeyRegistrationOptions(this.token);
      const credential = await startPasskeyRegistration(options);
      const result = await auth.verifyPasskeyRegistration(credential, this.token);
      if (!result?.verified) {
        this.errorType.set('general');
        this.errorMsg.set(this.t('passkey.error.verify'));
        return;
      }
      this.done.set(true);
      this.complete.emit();
    } catch (err: any) {
      const type = classifyError(err);
      this.errorType.set(type);
      this.errorMsg.set(
        type === 'cancelled'
          ? this.t('passkey.error.cancelled')
          : type === 'expired'
            ? this.t('passkey.error.expired')
            : authErrorMessage(err, this.translate, 'passkey.error.setupFailed'),
      );
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
