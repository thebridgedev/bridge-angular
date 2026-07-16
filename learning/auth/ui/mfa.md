# MFA / 2FA

Bridge's MFA is SMS-based: codes are 6-digit one-time codes texted to the phone number the user enrolls during setup, with a recovery code as backup. Two components cover the flow.

## MfaChallenge

Prompts the user to enter an MFA code. Appears automatically inside `<bridge-login-form>` when `authState` transitions to `'mfa-required'`. Can also be used standalone.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(verified)` | `EventEmitter<void>` | (none) | Called after successful MFA verification |
| `(error)` | `EventEmitter<Error>` | (none) | Called on verification error |
| `showRecoveryOption` | `boolean` | `true` | Show the recovery code toggle |

The component supports two modes:
1. **Authentication code**: the user enters the 6-digit code texted to their enrolled phone number, with a resend option (60-second cooldown).
2. **Recovery code**: the user enters the recovery code they saved during setup instead, for example after losing their phone.

**Standalone usage:**

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, MfaChallengeComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-mfa-challenge-page',
  standalone: true,
  imports: [MfaChallengeComponent],
  template: `
    @if (authService.authState() === 'mfa-required') {
      <bridge-mfa-challenge
        (verified)="router.navigateByUrl('/dashboard')"
        (error)="onError($event)"
      />
    }
  `,
})
export class MfaChallengePageComponent {
  protected readonly authService = inject(AuthService);
  protected readonly router = inject(Router);

  onError(err: Error): void {
    console.error(err);
  }
}
```

## MfaSetup

Guides the user through a 3-step MFA setup flow: enter a phone number, verify the 6-digit code texted to it, then save the one-time recovery code. Appears automatically inside `<bridge-login-form>` when `authState` transitions to `'mfa-setup-required'`.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(complete)` | `EventEmitter<void>` | (none) | Called after MFA setup is complete |
| `(error)` | `EventEmitter<Error>` | (none) | Called on setup error |

**Standalone usage:**

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, MfaSetupComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-mfa-setup-page',
  standalone: true,
  imports: [MfaSetupComponent],
  template: `
    @if (authService.authState() === 'mfa-setup-required') {
      <bridge-mfa-setup
        (complete)="router.navigateByUrl('/dashboard')"
        (error)="onError($event)"
      />
    }
  `,
})
export class MfaSetupPageComponent {
  protected readonly authService = inject(AuthService);
  protected readonly router = inject(Router);

  onError(err: Error): void {
    console.error(err);
  }
}
```

To turn MFA on for your app in the first place, see [MFA / 2FA](/auth/sign-in/mfa/) under Sign-in methods.
