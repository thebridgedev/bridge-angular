/**
 * PasskeyRequestSetupLink — Angular port of bridge-svelte's
 * `sdk-auth/PasskeyRequestSetupLink.svelte`.
 *
 * Emails a passkey-setup link via `sendPasskeySetupLink(email)`. Mirrors react's
 * `PasskeyRequestSetupLink.tsx`: emits `back` if a host wants to intercept the
 * "Back to login" action, otherwise renders a `loginHref` anchor.
 */
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-passkey-request-setup-link',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper
      [heading]="wrapperHeading"
      [description]="wrapperDescription"
      [className]="className"
      [style]="style"
    >
      <!-- The catalogue holds the whole sentence with an {email} placeholder so
           a locale can put the address wherever it belongs; the split runs on the
           already-translated string purely to wrap it in <strong>. -->
      @if (sent() && description === undefined) {
        <p description class="bridge-step-desc">
          {{ sentDescriptionParts[0] }}<strong>{{ email }}</strong>{{ sentDescriptionParts[1] ?? '' }}
        </p>
      }

      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (sent()) {
        <div class="bridge-form-footer">
          @if (back.observed) {
            <button type="button" class="bridge-link" (click)="back.emit()">{{ t('action.backToLogin') }}</button>
          } @else {
            <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
          }
        </div>
      } @else {
        <form (ngSubmit)="handleSubmit()">
          <div class="bridge-form-group">
            <label for="passkey-request-email">{{ t('field.email') }}</label>
            <input
              id="passkey-request-email"
              type="email"
              [placeholder]="t('placeholder.email')"
              required
              [(ngModel)]="email"
              name="email"
              [disabled]="loading()"
            />
          </div>
          <button
            type="submit"
            class="bridge-btn bridge-btn-primary"
            [disabled]="loading() || !email.trim()"
          >
            @if (loading()) {
              <bridge-auth-spinner [size]="16" />
            } @else {
              {{ t('passkey.requestSubmit') }}
            }
          </button>
        </form>
        <div class="bridge-form-footer">
          @if (back.observed) {
            <button type="button" class="bridge-link" (click)="back.emit()">{{ t('action.backToLogin') }}</button>
          } @else {
            <a [href]="loginHref">{{ t('action.backToLogin') }}</a>
          }
        </div>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class PasskeyRequestSetupLinkComponent extends TranslatableComponent implements OnInit {
  @Input() initialEmail = '';
  @Input() loginHref = '/auth/login';
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  /**
   * Step description. Pass `null`/`''` to render nothing and use your own
   * subtitle (TBP-631). Applies to whichever view is showing; the two views have
   * different built-in copy, and the 'sent' one carries markup, so a string
   * override replaces both with the same sentence.
   */
  @Input() description?: string | null;
  @Input() className = '';
  @Input() style = '';
  @Output() sentEvent = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();
  @Output() back = new EventEmitter<void>();

  private readonly authService = inject(AuthService);

  email = '';
  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected get wrapperHeading(): string | null {
    if (this.heading !== undefined) return this.heading;
    return this.sent() ? this.t('passkey.sentHeading') : this.t('passkey.createHeading');
  }

  protected get wrapperDescription(): string | null {
    if (this.description !== undefined) return this.description;
    // The 'sent' description carries markup, so it is projected as a
    // `[description]` element above rather than passed as a string.
    return this.sent() ? null : this.t('passkey.requestDescription');
  }

  protected get sentDescriptionParts(): string[] {
    return this.t('passkey.sentDescription').split('{email}');
  }

  ngOnInit(): void {
    this.email = this.initialEmail;
  }

  async handleSubmit(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).sendPasskeySetupLink(this.email);
      this.sent.set(true);
      this.sentEvent.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || this.t('passkey.error.sendLink'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
