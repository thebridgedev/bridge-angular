# Passkeys

Passkey (WebAuthn) authentication lets users sign in with a biometric or device credential instead of a password. bridge-angular needs `@simplewebauthn/browser` as a peer dependency for the passkey components.

## PasskeyLogin

`<bridge-passkey-login>` is a button that triggers passkey authentication via the browser's WebAuthn API (`authenticateWithPasskey()`).

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `setupHref` | `string` | — | URL to navigate to when the user has no registered passkey, if nothing is bound to `(setupPasskey)` |
| `label` | `string` | `'Continue with passkey'` | Button label |
| `className` | `string` | `''` | CSS class applied to the button |
| `style` | `string` | `''` | Inline style applied to the button |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `login` | `EventEmitter<void>` | Fires after successful passkey login |
| `error` | `EventEmitter<Error>` | Fires on error |
| `setupPasskey` | `EventEmitter<void>` | Fires when the browser reports the user has no passkey yet, instead of falling back to `setupHref` |

```ts
// login.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PasskeyLoginComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-passkey-login',
  standalone: true,
  imports: [PasskeyLoginComponent],
  template: `
    <bridge-passkey-login
      setupHref="/auth/setup-passkey"
      (login)="onLogin()"
      (error)="onError($event)"
    />
  `,
})
export class PasskeyLoginPageComponent {
  constructor(private router: Router) {}

  onLogin(): void {
    this.router.navigateByUrl('/dashboard');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

## PasskeySetup

`<bridge-passkey-setup>` registers a new passkey using a setup token (emailed to the user via `PasskeyRequestSetupLink` below), by calling `registerPasskeyWithToken(token)`.

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `token` | `string` | **(required)** | The setup token from the URL |
| `loginHref` | `string` | `'/auth/login'` | Link shown after successful registration |
| `className` | `string` | `''` | CSS class applied to the card container |
| `style` | `string` | `''` | Inline style applied to the card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `complete` | `EventEmitter<void>` | Fires after passkey registration succeeds |
| `error` | `EventEmitter<Error>` | Fires on any registration error, including an expired or invalid token — there's no separate "expired" signal, so a generic error message is shown either way |

```ts
// passkey-setup.component.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { PasskeySetupComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-passkey-setup',
  standalone: true,
  imports: [PasskeySetupComponent],
  template: `
    <bridge-passkey-setup
      [token]="token()"
      loginHref="/auth/login"
    />
  `,
})
export class PasskeySetupPageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly token = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('token') ?? '')),
    { initialValue: '' },
  );
}
```

## PasskeyRequestSetupLink

`<bridge-passkey-request-setup-link>` is an email form that requests a passkey setup link be sent to the user (`sendPasskeySetupLink(email)`).

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `initialEmail` | `string` | `''` | Pre-filled email address |
| `loginHref` | `string` | `'/auth/login'` | "Back to login" link, used when nothing is bound to `(back)` |
| `className` | `string` | `''` | CSS class applied to the card container |
| `style` | `string` | `''` | Inline style applied to the card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `sentEvent` | `EventEmitter<void>` | Fires after the setup link email is sent |
| `error` | `EventEmitter<Error>` | Fires on error |
| `back` | `EventEmitter<void>` | Fires when "Back to login" is clicked, if bound. Unlike `loginHref`'s plain anchor, this lets a host intercept the action instead of navigating |

```ts
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
