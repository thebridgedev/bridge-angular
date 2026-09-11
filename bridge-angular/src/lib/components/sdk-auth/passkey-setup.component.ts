/**
 * PasskeySetup — Angular port of bridge-svelte's `sdk-auth/PasskeySetup.svelte`.
 *
 * Registers a WebAuthn passkey from a token'd setup link via
 * `registerPasskeyWithToken(token)`. Mirrors react's `PasskeySetup.tsx`. Used by
 * the `/auth/setup-passkey/:token` route.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

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
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
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

  private readonly authService = inject(AuthService);

  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
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

  async handleRegister(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).registerPasskeyWithToken(this.token);
      this.done.set(true);
      this.complete.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || this.t('passkey.error.setupFailed'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
