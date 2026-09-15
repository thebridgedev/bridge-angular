/**
 * SsoButton — Angular port of bridge-svelte's `sdk-auth/SsoButton.svelte`.
 *
 * Starts a federation login via `getBridgeAuth().startSsoLogin(type, { mode })`.
 * Mirrors react's `SsoButton.tsx`: `data-bridge-sso-button` + `data-loading`,
 * emits `success` / `error` outputs. Accepts a projected icon via `<ng-content>`.
 *
 * Reactive translation (§5.1): svelte `$state(loading)` → `signal`.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { FederationConnection } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { authErrorMessage, displayError } from './shared/auth-error';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-sso-button',
  standalone: true,
  imports: [AuthSpinnerComponent],
  template: `
    <button
      type="button"
      [class]="className"
      [style]="style"
      data-bridge-sso-button
      [attr.data-loading]="loading()"
      [disabled]="loading()"
      (click)="handleClick()"
    >
      <span class="bridge-sso-btn-inner">
        @if (loading()) {
          <bridge-auth-spinner [size]="16" />
        } @else {
          <ng-content></ng-content>
        }
        <span>{{ buttonLabel() }}</span>
      </span>
    </button>
  `,
})
export class SsoButtonComponent extends TranslatableComponent {
  @Input({ required: true }) connection!: FederationConnection;
  @Input() label = '';
  @Input() mode: 'redirect' | 'popup' = 'redirect';
  @Input() className = '';
  @Input() style = '';
  @Output() success = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);
  protected readonly loading = signal(false);

  /**
   * `label` still wins: an app naming its own provider button is voice, not
   * mechanics, and the catalogue only supplies the default (TBP-634).
   *
   * A method rather than a computed signal because `label`, `messages` and
   * `connection` are all plain `@Input()`s, not signal inputs — a computed
   * would capture their construction-time values and never update.
   */
  buttonLabel(): string {
    return this.label || this.t('sso.continueWith', { provider: this.connection.name });
  }

  async handleClick(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      const result = await (this.authService.getBridgeAuth() as any).startSsoLogin(
        this.connection.type,
        { mode: this.mode },
      );
      if (result.type === 'auth_success') {
        this.success.emit();
      } else if (result.type === 'auth_error') {
        throw new Error(result.error || this.t('sso.error.login'));
      }
    } catch (err: any) {
      const message = err.message?.includes('popup')
        ? this.t('sso.error.popupBlocked')
        : authErrorMessage(err, this.translate, 'sso.error.login');
      this.error.emit(displayError(err, message));
    } finally {
      this.loading.set(false);
    }
  }
}
