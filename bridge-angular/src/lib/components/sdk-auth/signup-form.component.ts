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
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-signup-form',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper [heading]="heading" [className]="className" [style]="style">
      @if (success()) {
        <h2 class="bridge-success-heading">Check your email</h2>
        <p class="bridge-step-desc">
          We sent a verification link to <strong>{{ email }}</strong>. Check your inbox to
          activate your account.
        </p>
        @if (showLoginLink) {
          <div class="bridge-form-footer">
            Already have an account? <a [href]="loginHref">Log in</a>
          </div>
        }
      } @else {
        @if (errorMsg()) {
          <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
        }

        <form (ngSubmit)="handleSubmit()">
          <div class="bridge-form-group">
            <label for="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              required
              [(ngModel)]="email"
              name="email"
              [disabled]="loading()"
            />
          </div>
          <div class="bridge-form-group">
            <label for="signup-first-name">First name</label>
            <input
              id="signup-first-name"
              type="text"
              placeholder="First name"
              [(ngModel)]="firstName"
              name="firstName"
              [disabled]="loading()"
            />
          </div>
          <div class="bridge-form-group">
            <label for="signup-last-name">Last name</label>
            <input
              id="signup-last-name"
              type="text"
              placeholder="Last name"
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
              Sign up
            }
          </button>
        </form>

        @if (showLoginLink) {
          <div class="bridge-form-footer">
            Already have an account? <a [href]="loginHref">Log in</a>
          </div>
        }
      }
    </bridge-auth-form-wrapper>
  `,
})
export class SignupFormComponent {
  @Input() showLoginLink = true;
  @Input() loginHref = '/auth/login';
  @Input() heading = 'Create your account';
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

  async handleSubmit(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await this.authService.getBridgeAuth().signup(this.email, this.firstName, this.lastName);
      this.success.set(true);
      this.signup.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to create account.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
