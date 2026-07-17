# Magic link

Standalone magic link request form. When a user clicks a magic link from their email, the token is in the URL and Bridge processes it automatically inside `<bridge-login-form>`.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(sentEvent)` | `EventEmitter<void>` | (none) | Called after the magic link email is sent |
| `(error)` | `EventEmitter<Error>` | (none) | Called on error |
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page |

**Usage:**

```typescript
// src/app/pages/auth/magic-link.component.ts
import { Component } from '@angular/core';
import { MagicLinkComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-magic-link',
  standalone: true,
  imports: [MagicLinkComponent],
  template: `
    <bridge-magic-link
      loginHref="/auth/login"
      (sentEvent)="onSent()"
      (error)="onError($event)"
    />
  `,
})
export class MagicLinkPageComponent {
  onSent(): void {
    console.log('Check your email!');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

When the user clicks the link in their email, they are brought to your app with a `bridge_magic_link_token` query parameter.

> **Framework note:** the token is consumed by `<bridge-login-form>` on init, not during app bootstrap, so the link must land on a page that renders `<bridge-login-form>` (your login route).
