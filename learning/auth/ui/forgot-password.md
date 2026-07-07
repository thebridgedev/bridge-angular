# Forgot / reset password

`<bridge-forgot-password>` is a dual-mode standalone page component:
1. **Request mode** (no `token` input) — shows an email form to request a password reset link.
2. **Reset mode** (`token` input set) — shows a new password form (with confirmation) to complete the reset.

This is a separate, routable component from the inline forgot-password step built into `<bridge-login-form>` (see [Email & password](/auth/ui/email-password/)) — that inline step only requests the link and never handles a reset token.

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `token` | `string` | — | Reset token from the URL. When set, the component renders the new-password (reset) form instead of the request form |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page |
| `className` | `string` | `''` | CSS class applied to the card container |
| `style` | `string` | `''` | Inline style applied to the card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `complete` | `EventEmitter<void>` | Fires after the password is successfully reset (reset mode only — it does **not** fire after the request-mode email is sent) |
| `error` | `EventEmitter<Error>` | Fires on error, in either mode |

**Request page:**

```ts
// forgot-password.component.ts
import { Component } from '@angular/core';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `
    <bridge-forgot-password
      loginHref="/auth/login"
      (error)="onError($event)"
    />
  `,
})
export class ForgotPasswordPageComponent {
  onError(err: Error): void {
    console.error(err);
  }
}
```

**Reset page (with token from the route):**

```ts
// reset-password.component.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `
    <bridge-forgot-password
      [token]="token()"
      loginHref="/auth/login"
      (complete)="router.navigateByUrl('/auth/login')"
    />
  `,
})
export class ResetPasswordPageComponent {
  protected readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly token = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('token') ?? '')),
    { initialValue: '' },
  );
}
```

The new-password form requires the password to be at least 8 characters and the confirmation field to match — both are validated client-side before `updatePassword(token, password)` is called.
