# Auth states

`AuthService.authState` is a single reactive signal that tells you exactly where a user is in the login flow — from "not signed in" through any in-progress step, to fully authenticated. It's what drives `<bridge-login-form>`'s multi-step behavior (MFA, tenant selection, etc.) automatically, and you can read the same signal yourself to build custom flows.

## The states

| State | Meaning |
|-------|---------|
| `'unauthenticated'` | No valid tokens — the user isn't signed in |
| `'credentials-validated'` | Email/password (or equivalent) passed; Bridge is deciding whether MFA or tenant selection is needed next |
| `'mfa-required'` | An MFA code challenge is pending |
| `'mfa-setup-required'` | The user must set up MFA before continuing (first-time enrollment) |
| `'tenant-selection'` | The user has access to more than one workspace and needs to pick one |
| `'authenticated'` | Fully signed in with valid tokens — the user can use the app |

Any state returns to `'unauthenticated'` on logout or if the tokens are cleared.

## Branching on it yourself

`<bridge-login-form>` handles all of this internally, so you only need this if you're building a custom login screen instead of using the drop-in component:

```ts
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
    @if (authService.authState() === 'unauthenticated') {
      <p>Please sign in.</p>
    } @else if (authService.authState() === 'credentials-validated') {
      <p>Checking your account…</p>
    } @else if (authService.authState() === 'mfa-required') {
      <bridge-mfa-challenge (verified)="onDone()" />
    } @else if (authService.authState() === 'mfa-setup-required') {
      <bridge-mfa-setup (complete)="onDone()" />
    } @else if (authService.authState() === 'tenant-selection') {
      <bridge-tenant-selector (select)="onDone()" />
    } @else if (authService.authState() === 'authenticated') {
      <p>You're in.</p>
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

During `'tenant-selection'`, `authService.tenantUsers()` holds the list of workspace memberships the user can pick from — `<bridge-tenant-selector>` reads it from the same signal. See [Switching workspaces](/auth/ui/switching-workspaces/) and [MFA / 2FA](/auth/ui/mfa/) in UI components for the drop-in components' full props.

## Checking just "am I logged in"

For the common case — gating a route or showing/hiding a nav item — you don't need the full state machine, just whether it resolved to `'authenticated'`. `AuthService.isAuthenticated` (computed from the current tokens) and `AuthService.isLoading` cover that:

```ts
import { Component, inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-gate',
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
export class GateComponent {
  protected readonly authService = inject(AuthService);
}
```

For gating whole routes rather than pieces of a template, use `bridgeAuthGuard()` instead — see [Route guards](/auth/securing/route-guards/).
