# Email & password

`<bridge-login-form>` is a complete login form with email/password fields. It handles multi-step auth flows inline: forgot password, magic link, passkey login, MFA challenge, MFA setup, and tenant selection all appear automatically within the same component when the auth state requires them.

**Usage:**

```ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LoginFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LoginFormComponent],
  template: `
    <bridge-login-form
      [showSignupLink]="true"
      signupHref="/auth/signup"
      [showForgotPassword]="true"
      [showMagicLink]="true"
      [showPasskeys]="true"
      (login)="onLogin()"
      (error)="onError($event)"
    />
  `,
})
export class LoginComponent {
  constructor(private router: Router) {}

  onLogin(): void {
    this.router.navigateByUrl('/dashboard');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `showSignupLink` | `boolean` | auto — `appConfig().signupEnabled`, falls back to `true` if unset | Show a link to the signup page |
| `signupHref` | `string` | `'/auth/signup'` | Signup page URL |
| `showForgotPassword` | `boolean` | `true` | Show the "Forgot password?" link |
| `forgotPasswordHref` | `string` | `'/auth/forgot-password'` | Reserved for a future external-redirect mode. Currently unused — "Forgot password?" always opens the inline reset-request step (see below), regardless of this value |
| `showMagicLink` | `boolean` | auto — `appConfig().magicLinkEnabled`, falls back to `false` if unset | Show the "Sign in with Magic Link" link |
| `magicLinkHref` | `string` | `'/auth/magic-link'` | URL the magic link link points to — see [Magic link](/auth/ui/magic-link/) |
| `showPasskeys` | `boolean` | auto — `appConfig().passkeysEnabled`, falls back to `false` if unset | Show the passkey login button |
| `passkeySetupHref` | `string` | `'/auth/setup-passkey'` | Where a user with no registered passkey is sent, if nothing is bound to the passkey button's `setupPasskey` output — see [Passkeys](/auth/ui/passkeys/) |
| `heading` | `string` | `''` | Custom heading text |
| `ssoConnections` | `FederationConnection[]` | `[]` | SSO connections to render as buttons. Auto-derived from app config when left empty |
| `ssoMode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy for the built-in buttons. Ignored when an `(onSsoClick)` listener is bound |
| `className` | `string` | `''` | CSS class applied to the form's card container |
| `style` | `string` | `''` | Inline style applied to the form's card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `login` | `EventEmitter<void>` | Fires once — the first time auth state flips to `'authenticated'` — after any MFA or tenant-selection steps have completed |
| `error` | `EventEmitter<Error>` | Fires on any login, forgot-password, or SSO error |
| `onSsoClick` | `EventEmitter<string>` | Fires with the connection `type` when an SSO button is clicked, replacing that button's default redirect/popup flow with your own handler |

If `showPasskeys` is on (or auto-enabled via app config), the host app needs `@simplewebauthn/browser` as a peer dependency — see [Passkeys](/auth/ui/passkeys/).

**Auth state transitions:** `<bridge-login-form>` watches `AuthService.authState()`. When it becomes `'mfa-required'` the form swaps to `<bridge-mfa-challenge>`; `'mfa-setup-required'` swaps to `<bridge-mfa-setup>`; `'tenant-selection'` swaps to `<bridge-tenant-selector>`. The `login` output only fires once auth state settles on `'authenticated'`, so it fires after all of those steps are done.

**Inline forgot password:** Clicking "Forgot password?" swaps the form to an inline email step (no navigation) that calls `sendResetPasswordLink`. This inline step only requests the link — it doesn't handle the reset-token step. That's a distinct standalone page component; see [Forgot / reset password](/auth/ui/forgot-password/).

**Magic link token consumption:** On init, `<bridge-login-form>` checks the URL for a `bridge_magic_link_token` query parameter. If present, it strips the parameter from the URL and calls `authenticateWithMagicLinkToken` automatically. This check only runs inside `LoginFormComponent` itself — there's no separate bootstrap-level handler, so a magic link redirect needs to land on a page that renders `<bridge-login-form>`.
