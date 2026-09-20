# Magic link

Standalone magic link request form. It also redeems the link: the emailed link returns to the page the request was made from, and this component reads the token out of the URL on init.

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

When the user clicks the link in their email, they land back on the route they requested it from — `/auth/magic-link` in the example above — with a `bridge_magic_link_token` query parameter. `<bridge-magic-link>` redeems that token on init, strips it from the URL and signs the user in; `<bridge-login-form>` does the same, so either component works as the landing page. Keep that route reachable to signed-out users.

> **Framework note:** the token is consumed by the component on init, not during app bootstrap, so the link must land on a route that renders `<bridge-magic-link>` or `<bridge-login-form>`. To point the email at a different page, pass `successUrl` to `sendMagicLink`; the URL must be one of your app's allowed origins. See [Magic link](/auth/sign-in/magic-link/#where-the-link-comes-back) in sign-in methods.
