# Passkeys

Passkey (WebAuthn) authentication lets users sign in with a biometric or device
credential instead of a password. The browser ceremony runs through
`@simplewebauthn/browser`, which ships as a dependency of
`@nebulr-group/bridge-angular` and is loaded only when someone uses a passkey.

> **You may not need these components.** The routes from `bridgeAuthRoutes()`
> already show the passkey button on the login page when passkeys are on for the
> app, and serve `/auth/setup-passkey/:token`, the page the setup email links to.

## PasskeyLogin

A button that signs in with a passkey: it fetches the options from Bridge, asks
the browser's authenticator, and sends the signed answer back to Bridge. It
renders nothing in a browser without WebAuthn.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(login)` | `EventEmitter<void>` | (none) | Called after successful passkey login |
| `(error)` | `EventEmitter<Error>` | (none) | Called on error |
| `(setupPasskey)` | `EventEmitter<void>` | (none) | Called when the authenticator finds no passkey (or the person cancels), so the page can offer to set one up. `<bridge-login-form>` uses it to show the request-a-setup-link step in place |
| `setupHref` | `string` | (none) | URL to navigate to when the authenticator finds no passkey, if nothing is bound to `(setupPasskey)` |
| `autofill` | `boolean` | `false` | Offer passkeys in the browser's autofill (conditional mediation) |
| `label` | `string` | `'Continue with passkey'` | Button label text |

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PasskeyLoginComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-passkey-login-page',
  standalone: true,
  imports: [PasskeyLoginComponent],
  template: `
    <bridge-passkey-login
      setupHref="/auth/setup-passkey"
      (login)="router.navigateByUrl('/dashboard')"
      (error)="onError($event)"
    />
  `,
})
export class PasskeyLoginPageComponent {
  protected readonly router = inject(Router);

  onError(err: Error): void {
    console.error(err);
  }
}
```

## PasskeySetup

Registers a new passkey using a setup token (emailed to the user).

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | **(required)** | The setup token from the URL |
| `(complete)` | `EventEmitter<void>` | (none) | Called after passkey registration |
| `(error)` | `EventEmitter<Error>` | (none) | Called on any registration error, including an expired or invalid token |
| `(expired)` | `EventEmitter<void>` | (none) | When bound, an expired link shows a "Request new setup link" button that emits it. The built-in `/auth/setup-passkey/:token` page sends the person back to sign-in |
| `loginHref` | `string` | `'/auth/login'` | Link shown after successful registration |

```typescript
// src/app/pages/auth/setup-passkey.component.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PasskeySetupComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-setup-passkey',
  standalone: true,
  imports: [PasskeySetupComponent],
  template: `
    <bridge-passkey-setup
      [token]="token"
      loginHref="/auth/login"
      (complete)="router.navigateByUrl('/auth/login')"
    />
  `,
})
export class SetupPasskeyPageComponent {
  protected readonly router = inject(Router);
  protected readonly token =
    inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
}
```

Register the page at `auth/setup-passkey/:token`, the address the passkey setup email links to. The token is a route parameter, not a query parameter:

```typescript
// src/app/app.routes.ts
{ path: 'auth/setup-passkey/:token', component: SetupPasskeyPageComponent },
```

## PasskeyRequestSetupLink

An email form that requests a passkey setup link be sent to the user.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `initialEmail` | `string` | `''` | Pre-filled email address |
| `(back)` | `EventEmitter<void>` | (none) | Called when user clicks back |
| `(sentEvent)` | `EventEmitter<void>` | (none) | Called after the setup link email is sent |
| `(error)` | `EventEmitter<Error>` | (none) | Called on error |
| `loginHref` | `string` | `'/auth/login'` | "Back to login" link, used when nothing is bound to `(back)` |

```typescript
import { Component } from '@angular/core';
import { PasskeyRequestSetupLinkComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-passkey-request-setup-link',
  standalone: true,
  imports: [PasskeyRequestSetupLinkComponent],
  template: `
    <bridge-passkey-request-setup-link
      initialEmail="user@example.com"
      (back)="onBack()"
    />
  `,
})
export class PasskeyRequestSetupLinkPageComponent {
  onBack(): void {
    console.log('Back to login');
  }
}
```
