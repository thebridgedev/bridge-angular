# Forgot / reset password

Dual-mode component:
1. **Request mode** (no `token` input): shows an email form to request a password reset link.
2. **Reset mode** (`token` input set): shows a new password form to complete the reset.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | (none) | Reset token from URL. When set, shows the new password form |
| `(complete)` | `EventEmitter<void>` | (none) | Called after the password is reset (reset mode; in request mode a confirmation is shown inline instead) |
| `(error)` | `EventEmitter<Error>` | (none) | Called on error |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page |

**Request page:**

```typescript
// src/app/pages/auth/forgot-password.component.ts
import { Component } from '@angular/core';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `
    <bridge-forgot-password loginHref="/auth/login" />
  `,
})
export class ForgotPasswordPageComponent {}
```

**Reset page (with token from URL):**

```typescript
// src/app/pages/auth/reset-password.component.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `
    <bridge-forgot-password
      [token]="token"
      loginHref="/auth/login"
      (complete)="router.navigateByUrl('/auth/login')"
    />
  `,
})
export class ResetPasswordPageComponent {
  protected readonly router = inject(Router);
  protected readonly token =
    inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
}
```
