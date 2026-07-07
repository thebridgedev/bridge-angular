# Signup

A signup form with email, first name, and last name fields.

**`bridge-signup-form` (`SignupFormComponent`):**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `showLoginLink` | `boolean` | `true` | Show a link to the login page |
| `loginHref` | `string` | `'/auth/login'` | Login page URL |
| `heading` | `string` | `'Create your account'` | Custom heading text |
| `className` | `string` | `''` | Forwarded to the form wrapper's `class` |
| `style` | `string` | `''` | Forwarded to the form wrapper's `style` |

| Output | Type | Description |
|--------|------|-------------|
| `signup` | `EventEmitter<void>` | Emitted after successful signup |
| `error` | `EventEmitter<Error>` | Emitted on signup error |

**Usage:**

```ts
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
      (signup)="onSignup()"
      (error)="onError($event)"
    />
  `,
})
export class SignupPageComponent {
  private readonly router = inject(Router);

  onSignup(): void {
    this.router.navigateByUrl('/auth/login');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

After signup, the user receives a verification email. Once verified, they can log in.
