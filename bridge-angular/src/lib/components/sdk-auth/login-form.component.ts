/**
 * LoginForm — Angular port of bridge-svelte's `sdk-auth/LoginForm.svelte`.
 *
 * The orchestrator of the in-app SDK auth flow. Handles:
 *  - password login (`authenticate(email, password)`)
 *  - inline forgot-password step (`sendResetPasswordLink`) without navigation
 *  - magic-link token consumption on mount (`authenticateWithMagicLinkToken`)
 *  - auth-state driven swaps to <bridge-mfa-challenge> / <bridge-mfa-setup> /
 *    <bridge-tenant-selector>
 *  - SSO buttons + passkey + magic-link alternatives derived from anonymous
 *    app config (`AuthService.appConfig` signal)
 *
 * Reactive translation (§5.1): react `useBridgeStore(s => s.authState/appConfig)`
 * → `AuthService.authState` / `appConfig` signals; `useEffect([], mount)` →
 * `ngOnInit`; `useEffect([authState])` → an `effect()` watching `authState()`.
 */
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AppConfig, FederationConnection } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';
import { MfaChallengeComponent } from './mfa-challenge.component';
import { MfaSetupComponent } from './mfa-setup.component';
import { TenantSelectorComponent } from './tenant-selector.component';
import { SsoButtonComponent } from './sso-button.component';
import { SsoProviderIconComponent } from './sso-provider-icon.component';
import { PasskeyLoginComponent } from './passkey-login.component';

function buildSsoConnections(appConfig: AppConfig | null): FederationConnection[] {
  if (!appConfig) return [];
  const cfg = appConfig as any;
  const out: FederationConnection[] = [];
  if (cfg.googleSsoEnabled) out.push({ id: 'google', type: 'google', name: 'Google' });
  if (cfg.azureAdSsoEnabled) out.push({ id: 'azure', type: 'ms-azure-ad', name: 'Microsoft' });
  if (cfg.linkedinSsoEnabled) out.push({ id: 'linkedin', type: 'linkedin', name: 'LinkedIn' });
  if (cfg.githubSsoEnabled) out.push({ id: 'github', type: 'github', name: 'GitHub' });
  if (cfg.facebookSsoEnabled) out.push({ id: 'facebook', type: 'facebook', name: 'Facebook' });
  if (cfg.appleSsoEnabled) out.push({ id: 'apple', type: 'apple', name: 'Apple' });
  return out;
}

@Component({
  selector: 'bridge-login-form',
  standalone: true,
  imports: [
    FormsModule,
    AuthFormWrapperComponent,
    AuthAlertComponent,
    AuthSpinnerComponent,
    MfaChallengeComponent,
    MfaSetupComponent,
    TenantSelectorComponent,
    SsoButtonComponent,
    SsoProviderIconComponent,
    PasskeyLoginComponent,
  ],
  template: `
    @if (authState() === 'mfa-required') {
      <bridge-mfa-challenge (error)="error.emit($event)" />
    } @else if (authState() === 'mfa-setup-required') {
      <bridge-mfa-setup (error)="error.emit($event)" />
    } @else if (authState() === 'tenant-selection') {
      <bridge-tenant-selector (error)="error.emit($event)" />
    } @else if (step() === 'forgot-password') {
      <bridge-auth-form-wrapper heading="Reset your password" [className]="className" [style]="style">
        @if (errorMsg()) {
          <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
        }
        @if (fpEmailSent()) {
          <bridge-auth-alert variant="success">Check your email for a password reset link.</bridge-auth-alert>
          <div class="bridge-form-footer">
            <button type="button" class="bridge-link" (click)="goBackToCredentials()">Back to login</button>
          </div>
        } @else {
          <form (ngSubmit)="handleForgotSubmit()">
            <div class="bridge-form-group">
              <label for="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                required
                [(ngModel)]="email"
                name="email"
                [disabled]="fpLoading()"
              />
            </div>
            <button
              type="submit"
              class="bridge-btn bridge-btn-primary"
              [disabled]="fpLoading() || !email.trim()"
            >
              @if (fpLoading()) {
                <bridge-auth-spinner [size]="16" />
              } @else {
                Send reset link
              }
            </button>
          </form>
          <div class="bridge-form-footer">
            <button type="button" class="bridge-link" (click)="goBackToCredentials()">Back to login</button>
          </div>
        }
      </bridge-auth-form-wrapper>
    } @else {
      <bridge-auth-form-wrapper [heading]="heading" [className]="className" [style]="style">
        @if (errorMsg()) {
          <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
        }

        <form (ngSubmit)="handleSubmit()">
          <div class="bridge-form-group">
            <label for="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              required
              [(ngModel)]="email"
              name="email"
              [disabled]="loading()"
            />
          </div>

          <div class="bridge-form-group">
            <label for="login-password">Password</label>
            <div class="bridge-password-wrapper">
              <input
                id="login-password"
                [type]="showPassword() ? 'text' : 'password'"
                placeholder="Enter your password"
                required
                [(ngModel)]="password"
                name="password"
                [disabled]="loading()"
              />
              <button
                type="button"
                class="bridge-password-toggle"
                (click)="togglePassword()"
                tabindex="-1"
                [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              >
                {{ showPassword() ? '🙈' : '👁' }}
              </button>
            </div>
          </div>

          <button
            type="submit"
            class="bridge-btn bridge-btn-primary"
            [disabled]="loading() || !email.trim() || !password"
          >
            @if (loading()) {
              <bridge-auth-spinner [size]="16" /> Signing in…
            } @else {
              Sign in
            }
          </button>

          @if (effectiveShowForgotPassword()) {
            <div class="bridge-forgot-row">
              <button type="button" class="bridge-link" (click)="openForgot()">Forgot password?</button>
            </div>
          }
        </form>

        @if (effectiveShowPasskeys() || effectiveShowMagicLink() || effectiveSso().length > 0) {
          <div class="bridge-divider">or</div>
        }

        @if (effectiveShowPasskeys()) {
          <div class="bridge-sso-row">
            <bridge-passkey-login
              [setupHref]="passkeySetupHref"
              className="bridge-btn bridge-btn-secondary bridge-sso-btn"
              (login)="login.emit()"
              (error)="error.emit($event)"
            />
          </div>
        }

        @if (effectiveShowMagicLink()) {
          <div class="bridge-sso-row">
            <a
              [href]="magicLinkHref"
              class="bridge-btn bridge-btn-secondary bridge-sso-btn"
              data-bridge-magic-link
            >
              <span class="bridge-sso-btn-inner">Sign in with Magic Link</span>
            </a>
          </div>
        }

        @for (conn of effectiveSso(); track conn.id) {
          <div class="bridge-sso-row">
            @if (onSsoClick.observed) {
              <button
                type="button"
                class="bridge-btn bridge-btn-secondary bridge-sso-btn"
                (click)="onSsoClick.emit(conn.type)"
              >
                <bridge-sso-provider-icon [type]="conn.type" />
                <span>{{ conn.name }}</span>
              </button>
            } @else {
              <bridge-sso-button
                [connection]="conn"
                [mode]="ssoMode"
                className="bridge-btn bridge-btn-secondary bridge-sso-btn"
                (success)="login.emit()"
                (error)="error.emit($event)"
              >
                <bridge-sso-provider-icon [type]="conn.type" />
              </bridge-sso-button>
            }
          </div>
        }

        @if (effectiveShowSignupLink()) {
          <div class="bridge-form-footer">
            Don't have an account? <a [href]="signupHref">Sign up</a>
          </div>
        }
      </bridge-auth-form-wrapper>
    }
  `,
})
export class LoginFormComponent implements OnInit {
  @Input() showSignupLink?: boolean;
  @Input() signupHref = '/auth/signup';
  @Input() showForgotPassword?: boolean;
  @Input() forgotPasswordHref = '/auth/forgot-password';
  @Input() showMagicLink?: boolean;
  @Input() magicLinkHref = '/auth/magic-link';
  @Input() showPasskeys?: boolean;
  @Input() passkeySetupHref = '/auth/setup-passkey';
  @Input() heading = '';
  @Input() ssoConnections: FederationConnection[] = [];
  @Input() ssoMode: 'redirect' | 'popup' = 'redirect';
  @Input() className = '';
  @Input() style = '';

  @Output() login = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();
  @Output() onSsoClick = new EventEmitter<string>();

  private readonly authService = inject(AuthService);
  protected readonly authState = this.authService.authState;
  private readonly appConfig = this.authService.appConfig;

  email = '';
  password = '';
  protected readonly loading = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  // Inline forgot-password step machine — mirrors svelte/react.
  protected readonly step = signal<'credentials' | 'forgot-password'>('credentials');
  protected readonly fpEmailSent = signal(false);
  protected readonly fpLoading = signal(false);

  protected readonly effectiveSso = computed<FederationConnection[]>(() =>
    this.ssoConnections.length > 0 ? this.ssoConnections : buildSsoConnections(this.appConfig()),
  );
  protected readonly effectiveShowMagicLink = computed(
    () => this.showMagicLink ?? (this.appConfig() as any)?.magicLinkEnabled ?? false,
  );
  protected readonly effectiveShowPasskeys = computed(
    () => this.showPasskeys ?? (this.appConfig() as any)?.passkeysEnabled ?? false,
  );
  protected readonly effectiveShowForgotPassword = computed(() => this.showForgotPassword ?? true);
  protected readonly effectiveShowSignupLink = computed(
    () => this.showSignupLink ?? (this.appConfig() as any)?.signupEnabled ?? true,
  );

  constructor() {
    // react `useEffect([authState])` → fire onLogin once authenticated.
    let wasAuthenticated = false;
    effect(() => {
      const state = this.authState();
      if (state === 'authenticated' && !wasAuthenticated) {
        wasAuthenticated = true;
        this.login.emit();
      } else if (state !== 'authenticated') {
        wasAuthenticated = false;
      }
    });
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  ngOnInit(): void {
    void this.authService.ensureAppConfig();

    // Magic link token detection — same flow as svelte/react.
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('bridge_magic_link_token');
    if (!magicToken) return;

    params.delete('bridge_magic_link_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);

    this.loading.set(true);
    (this.authService.getBridgeAuth() as any)
      .authenticateWithMagicLinkToken(magicToken)
      .catch((err: any) => {
        this.errorMsg.set(err.message || 'Magic link authentication failed.');
        this.error.emit(err);
      })
      .finally(() => this.loading.set(false));
  }

  async handleSubmit(): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.loading.set(true);
    try {
      await this.authService.getBridgeAuth().authenticate(this.email, this.password);
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Invalid email or password.');
      this.error.emit(err);
      this.loading.set(false);
    }
  }

  openForgot(): void {
    this.step.set('forgot-password');
    this.errorMsg.set(null);
  }

  goBackToCredentials(): void {
    this.step.set('credentials');
    this.fpEmailSent.set(false);
    this.errorMsg.set(null);
  }

  async handleForgotSubmit(): Promise<void> {
    if (this.fpLoading()) return;
    this.errorMsg.set(null);
    this.fpLoading.set(true);
    try {
      await this.authService.getBridgeAuth().sendResetPasswordLink(this.email);
      this.fpEmailSent.set(true);
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to send reset link.');
      this.error.emit(err);
    } finally {
      this.fpLoading.set(false);
    }
  }
}
