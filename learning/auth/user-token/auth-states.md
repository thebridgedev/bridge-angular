# Auth states

`AuthService.authState` is a single reactive signal that tells you exactly where a user is in the login flow, from "not signed in" through any in-progress step, to fully authenticated. It's what drives `<bridge-login-form>`'s multi-step behavior (MFA, workspace selection, etc.) automatically, and you can read the same signal yourself to build custom flows.

## The states

| State | Meaning |
|-------|---------|
| `'unauthenticated'` | No valid tokens; the user isn't signed in |
| `'credentials-validated'` | Email/password (or equivalent) passed; Bridge is deciding whether MFA or workspace selection is needed next |
| `'mfa-required'` | An MFA code challenge is pending |
| `'mfa-setup-required'` | The user must set up MFA before continuing (first-time enrollment) |
| `'tenant-selection'` | The user has access to more than one workspace (called a *tenant* in the API) and needs to pick one |
| `'authenticated'` | Fully signed in with valid tokens; the user can use the app |

Any state returns to `'unauthenticated'` on logout or if the tokens are cleared. For how the tokens behind these states are stored, refreshed, and erased, see [Logging in and logging out](/auth/user-token/logging-in-and-out/).

## Branching on it yourself

`<bridge-login-form>` handles all of this internally, so you only need this if you're building a custom login screen instead of using the drop-in component:

```typescript
import { Component, inject } from '@angular/core';
import {
  AuthService,
  MfaChallengeComponent,
  MfaSetupComponent,
  TenantSelectorComponent,
} from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-custom-login',
  standalone: true,
  imports: [MfaChallengeComponent, MfaSetupComponent, TenantSelectorComponent],
  template: `
    @switch (authService.authState()) {
      @case ('unauthenticated') {
        <p>Please sign in.</p>
      }
      @case ('credentials-validated') {
        <p>Checking your account…</p>
      }
      @case ('mfa-required') {
        <bridge-mfa-challenge (verified)="onDone()" />
      }
      @case ('mfa-setup-required') {
        <bridge-mfa-setup (complete)="onDone()" />
      }
      @case ('tenant-selection') {
        <bridge-tenant-selector />
      }
      @case ('authenticated') {
        <p>You're in.</p>
      }
    }
  `,
})
export class CustomLoginComponent {
  protected readonly authService = inject(AuthService);

  onDone(): void {
    // navigate, close a modal, etc.
  }
}
```

## Checking just "am I signed in"

For the common case (gating a route or showing/hiding a nav item), you don't need the full state machine, just whether it resolved to `'authenticated'`. The `isAuthenticated` / `isLoading` signals cover that:

```typescript
import { Component, inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-auth-gate',
  standalone: true,
  template: `
    @if (authService.isLoading()) {
      <p>Loading...</p>
    } @else if (authService.isAuthenticated()) {
      <p>You are logged in!</p>
    } @else {
      <p>Please log in to continue.</p>
    }
  `,
})
export class AuthGateComponent {
  protected readonly authService = inject(AuthService);
}
```
