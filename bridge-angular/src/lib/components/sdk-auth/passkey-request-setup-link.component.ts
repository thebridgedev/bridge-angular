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
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-passkey-request-setup-link',
  standalone: true,
  imports: [FormsModule, AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper heading="Set up a passkey" [className]="className" [style]="style">
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      @if (sent()) {
        <bridge-auth-alert variant="success">
          Check your email — we sent a link to set up your passkey.
        </bridge-auth-alert>
        <div class="bridge-form-footer">
          @if (back.observed) {
            <button type="button" class="bridge-link" (click)="back.emit()">Back to login</button>
          } @else {
            <a [href]="loginHref">Back to login</a>
          }
        </div>
      } @else {
        <p class="bridge-step-desc">
          Enter your email and we'll send you a link to set up a passkey for faster sign-in.
        </p>
        <form (ngSubmit)="handleSubmit()">
          <div class="bridge-form-group">
            <label for="passkey-request-email">Email</label>
            <input
              id="passkey-request-email"
              type="email"
              placeholder="you@example.com"
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
              Send passkey setup link
            }
          </button>
        </form>
        <div class="bridge-form-footer">
          @if (back.observed) {
            <button type="button" class="bridge-link" (click)="back.emit()">Back to login</button>
          } @else {
            <a [href]="loginHref">Back to login</a>
          }
        </div>
      }
    </bridge-auth-form-wrapper>
  `,
})
export class PasskeyRequestSetupLinkComponent implements OnInit {
  @Input() initialEmail = '';
  @Input() loginHref = '/auth/login';
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
      this.errorMsg.set(err.message || 'Failed to send passkey setup link.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
    }
  }
}
