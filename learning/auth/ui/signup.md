# Signup

A signup form with email, first name, and last name fields. There is no password step here: the user activates the account through the verification email, then signs in with whichever method your app enables.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(signup)` | `EventEmitter<void>` | (none) | Called after successful signup |
| `(error)` | `EventEmitter<Error>` | (none) | Called on signup error |
| `showLoginLink` | `boolean` | `true` | Show a link to the login page |
| `loginHref` | `string` | `'/auth/login'` | Login page URL |
| `heading` | `string` | `'Create your account'` | Custom heading text |

**Usage:**

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [SignupFormComponent],
  template: `
    <bridge-signup-form
      [showLoginLink]="true"
      loginHref="/auth/login"
      (signup)="router.navigateByUrl('/auth/login')"
      (error)="onError($event)"
    />
  `,
})
export class SignupPageComponent {
  protected readonly router = inject(Router);

  onError(err: Error): void {
    console.error(err);
  }
}
```

After signup, the user receives a verification email. Once verified, they can sign in.

> **Tip:** `bridge-login-form`'s signup link points to `/auth/signup` unless you override it with its `signupHref` input; register your signup page on that route and the two components link up out of the box. See [Email & password](/auth/ui/email-password/).
