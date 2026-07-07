# MFA / 2FA

## MfaChallenge

`<bridge-mfa-challenge>` prompts the user for an MFA code. It appears automatically inside `<bridge-login-form>` when `AuthService.authState()` becomes `'mfa-required'`. It can also be rendered standalone.

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `showRecoveryOption` | `boolean` | `true` | Show the "Use recovery code" toggle |
| `className` | `string` | `''` | CSS class applied to the card container |
| `style` | `string` | `''` | Inline style applied to the card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `verified` | `EventEmitter<void>` | Fires after successful verification (auth code or recovery code) |
| `error` | `EventEmitter<Error>` | Fires on verification error |

The component supports two modes:
1. **Auth code** — the user enters a 6-digit code from their authenticator app (`verifyMfa(code)`).
2. **Recovery code** — the user enters a backup recovery code instead (`resetMfa(backupCode)`).

A "Resend code" link (`resendMfaCode()`) appears once the auth-code form is showing, gated behind a 60-second countdown after each send.

**Standalone usage:**

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, MfaChallengeComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-mfa-challenge',
  standalone: true,
  imports: [MfaChallengeComponent],
  template: `
    @if (authService.authState() === 'mfa-required') {
      <bridge-mfa-challenge
        (verified)="onVerified()"
        (error)="onError($event)"
      />
    }
  `,
})
export class MfaChallengePageComponent {
  protected readonly authService = inject(AuthService);

  constructor(private router: Router) {}

  onVerified(): void {
    this.router.navigateByUrl('/dashboard');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

## MfaSetup

`<bridge-mfa-setup>` guides the user through a 3-step MFA enrollment flow: enter phone number, verify the SMS code, then save the backup recovery code. It appears automatically inside `<bridge-login-form>` when `AuthService.authState()` becomes `'mfa-setup-required'`.

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `className` | `string` | `''` | CSS class applied to the card container |
| `style` | `string` | `''` | Inline style applied to the card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `complete` | `EventEmitter<void>` | Fires after the user clicks "Done" on the backup-code step (`completeMfaSetup()` resolves first) |
| `error` | `EventEmitter<Error>` | Fires on any step's error (send code, verify code) |

The three internal steps are `'phone'` → `'verify'` → `'backup'`:
1. **Phone** — `setupMfa(phoneNumber)` sends the SMS code.
2. **Verify** — `confirmMfaSetup(code)` returns a `backupCode`, which the user can copy to the clipboard. A resend link is available behind the same 60-second countdown as `MfaChallenge`, and "Change phone number" steps back to the phone form.
3. **Backup** — shows the backup code with a "Copy" button; clicking "Done" calls `completeMfaSetup()` and then emits `complete`.

**Standalone usage:**

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, MfaSetupComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-mfa-setup',
  standalone: true,
  imports: [MfaSetupComponent],
  template: `
    @if (authService.authState() === 'mfa-setup-required') {
      <bridge-mfa-setup
        (complete)="onComplete()"
        (error)="onError($event)"
      />
    }
  `,
})
export class MfaSetupPageComponent {
  protected readonly authService = inject(AuthService);

  constructor(private router: Router) {}

  onComplete(): void {
    this.router.navigateByUrl('/dashboard');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```
