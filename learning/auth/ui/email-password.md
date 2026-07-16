# Email & password

A complete login form with email/password fields. Handles multi-step auth flows inline: forgot password, magic link, passkey login, MFA challenge, MFA setup, and workspace selection all appear automatically within the same component when the auth state requires them.

**Usage:**

```typescript
import { Component, inject } from '@angular/core';
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
      (login)="router.navigateByUrl('/dashboard')"
      (error)="onError($event)"
    />
  `,
})
export class LoginPageComponent {
  protected readonly router = inject(Router);

  onError(err: Error): void {
    console.error(err);
  }
}
```

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `showSignupLink` | `boolean` | auto: `signupEnabled` from app config, `true` if unset | Show a link to the signup page |
| `signupHref` | `string` | `'/auth/signup'` | Signup page URL |
| `showForgotPassword` | `boolean` | `true` | Show the forgot password link |
| `forgotPasswordHref` | `string` | `'/auth/forgot-password'` | Reserved for a future external-redirect mode; currently the forgot password link always opens the inline form |
| `showMagicLink` | `boolean` | auto: `magicLinkEnabled` from app config, `false` if unset | Show the magic link login option |
| `magicLinkHref` | `string` | `'/auth/magic-link'` | Magic link request page URL |
| `showPasskeys` | `boolean` | auto: `passkeysEnabled` from app config, `false` if unset | Show the passkey login button |
| `passkeySetupHref` | `string` | `'/auth/setup-passkey'` | Passkey setup page URL |
| `(login)` | `EventEmitter<void>` | (none) | Called after successful login (all steps complete) |
| `(error)` | `EventEmitter<Error>` | (none) | Called on any login error |
| `(onSsoClick)` | `EventEmitter<string>` | (none) | Called when an SSO button is clicked |
| `heading` | `string` | `''` | Custom heading text |
| `ssoConnections` | `FederationConnection[]` | `[]` | SSO connections to display (a federation connection is an SSO identity provider configured for your app, e.g. Google or Azure AD). Auto-derived from app config if not set |
| `ssoMode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy for the built-in buttons. See [SSO mode](/auth/ui/google-sso/#sso-mode-redirect-vs-popup). Ignored when `(onSsoClick)` is provided. |

**Auth state transitions:** After a successful email/password login, the `<bridge-login-form>` checks the resulting auth state. If MFA is required, it automatically shows `<bridge-mfa-challenge>`. If MFA setup is required, it shows `<bridge-mfa-setup>`. If workspace selection is needed (multi-workspace user), it shows `<bridge-tenant-selector>`. The `(login)` output fires only after all steps are complete and the user is fully authenticated.
