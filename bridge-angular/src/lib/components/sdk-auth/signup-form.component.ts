/**
 * SignupForm — Angular port of bridge-svelte's `sdk-auth/SignupForm.svelte`.
 *
 * Self-service signup via `getBridgeAuth().signup(email, firstName, lastName)`.
 * Requires `tenantSelfSignup: true` on the Bridge app. Mirrors react's
 * `SignupForm.tsx`: on success it swaps to a "Check your email" confirmation.
 *
 * Reactive translation (§5.1): svelte `$state` → signals. The internal error
 * signal is `errorMsg` so the public `error` output keeps cross-plugin parity.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { authErrorMessage } from './shared/auth-error';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-signup-form',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <!-- In the success state the "Check your email" heading below is the title,
         so suppress the form heading to avoid two stacked headings. -->
    <bridge-auth-form-wrapper
      [heading]="success() ? null : wrapperHeading"
      [className]="className"
      [style]="style"
    >
      @if (success()) {
        <h2 class="bridge-success-heading">{{ t('signup.successHeading') }}</h2>
        <!-- NOT lifted into the wrapper, unlike the other components: it belongs
             under the heading above, which is rendered inside the wrapper's
             children rather than as the wrapper heading. Hoisting it would print
             the description above the heading it belongs to (TBP-631). -->
        @if (description === undefined) {
          <p class="bridge-step-desc">
            {{ successDescriptionParts[0] }}<strong>{{ email }}</strong>{{ successDescriptionParts[1] ?? '' }}
          </p>
        } @else if (description) {
          <p class="bridge-step-desc">{{ description }}</p>
        }
        @if (showLoginLink) {
          <div class="bridge-form-footer">
            {{ t('signup.loginPrompt') }} <a [href]="loginHref">{{ t('signup.loginLink') }}</a>
          </div>
        }
      } @else {
        @if (errorMsg()) {
          <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
        }

        <form (ngSubmit)="handleSubmit()">
          <div class="bridge-form-group">
            <label for="signup-email">{{ t('field.email') }}</label>
            <input
              id="signup-email"
              type="email"
              [placeholder]="t('placeholder.email')"
              required
              [(ngModel)]="email"
              name="email"
              [disabled]="loading()"
            />
          </div>
          <div class="bridge-form-group">
            <label for="signup-first-name">{{ t('field.firstName') }}</label>
            <input
              id="signup-first-name"
              type="text"
              [placeholder]="t('placeholder.firstName')"
              [(ngModel)]="firstName"
              name="firstName"
              [disabled]="loading()"
            />
          </div>
          <div class="bridge-form-group">
            <label for="signup-last-name">{{ t('field.lastName') }}</label>
            <input
              id="signup-last-name"
              type="text"
              [placeholder]="t('placeholder.lastName')"
              [(ngModel)]="lastName"
              name="lastName"
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
              {{ t('signup.submit') }}
            }
          </button>
        </form>

        @if (showLoginLink) {
          <div class="bridge-form-footer">
            {{ t('signup.loginPrompt') }} <a [href]="loginHref">{{ t('signup.loginLink') }}</a>
          </div>
        }
      }
    </bridge-auth-form-wrapper>
  `,
})
export class SignupFormComponent extends TranslatableComponent {
  @Input() showLoginLink = true;
  @Input() loginHref = '/auth/login';
  /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
  @Input() heading?: string | null;
  /** Success-state description. Pass `null`/`''` to render nothing (TBP-631). */
  @Input() description?: string | null;
  @Input() className = '';
  @Input() style = '';
  @Output() signup = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);

  email = '';
  firstName = '';
  lastName = '';
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly success = signal(false);

  protected get wrapperHeading(): string | null {
    return this.heading !== undefined ? this.heading : this.t('signup.heading');
  }

  /**
   * The catalogue holds the whole sentence with an `{email}` placeholder so a
   * locale can put the address wherever it belongs; the split runs on the
   * already-translated string purely to wrap it in `<strong>`.
   */
  protected get successDescriptionParts(): string[] {
    return this.t('signup.successDescription').split('{email}');
  }

  async handleSubmit(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await this.authService.getBridgeAuth().signup(this.email, this.firstName, this.lastName);
      this.success.set(true);
      this.signup.emit();
    } catch (err: any) {
      this.errorMsg.set(authErrorMessage(err, this.translate, 'signup.error.create'));
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
