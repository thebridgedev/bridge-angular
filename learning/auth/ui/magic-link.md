# Magic link

`<bridge-magic-link>` is a standalone magic-link request form. It calls `sendMagicLink(email)` and, once sent, shows a confirmation with the link's expiry ("Check your email — link expires in 15 minutes.").

**Inputs:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `loginHref` | `string` | `'/auth/login'` | Link back to the login page |
| `className` | `string` | `''` | CSS class applied to the card container |
| `style` | `string` | `''` | Inline style applied to the card container |

**Outputs:**

| Output | Type | Description |
|--------|------|-------------|
| `sentEvent` | `EventEmitter<void>` | Fires after the magic link email is sent |
| `error` | `EventEmitter<Error>` | Fires on error |

**Usage:**

```ts
// magic-link.component.ts
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

When the user clicks the link in their email, they land back in your app with a `bridge_magic_link_token` query parameter. That token is consumed automatically inside `<bridge-login-form>` on init (see [Email & password](/auth/ui/email-password/)) — `<bridge-magic-link>` itself only sends the email, so the link should route back to a page that renders `<bridge-login-form>`.
