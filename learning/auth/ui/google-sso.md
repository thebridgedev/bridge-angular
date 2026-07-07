# SSO login button

A standalone SSO login button for a single federation connection. Use this when you want SSO buttons outside of `bridge-login-form`, or to build a custom login page.

**`bridge-sso-button` (`SsoButtonComponent`):**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `connection` | `FederationConnection` | **(required)** | The SSO connection object |
| `label` | `string` | `''` | Button label text. Falls back to `'Continue with {connection.name}'` when empty |
| `mode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy. See [SSO mode](#sso-mode-redirect-vs-popup) |
| `className` | `string` | `''` | Forwarded to the root `<button>`'s `class` |
| `style` | `string` | `''` | Forwarded to the root `<button>`'s `style` |

| Output | Type | Description |
|--------|------|-------------|
| `success` | `EventEmitter<void>` | Emitted after successful SSO login (popup mode only — see below) |
| `error` | `EventEmitter<Error>` | Emitted on error |

There's no `icon` prop — the button's icon is supplied via content projection. Project a `<bridge-sso-provider-icon>` (or your own markup) as its child.

**Usage:**

```ts
import { Component } from '@angular/core';
import { SsoButtonComponent, SsoProviderIconComponent } from '@nebulr-group/bridge-angular';
import type { FederationConnection } from '@nebulr-group/bridge-auth-core';

@Component({
  selector: 'app-custom-login',
  standalone: true,
  imports: [SsoButtonComponent, SsoProviderIconComponent],
  template: `
    @for (connection of connections; track connection.id) {
      <bridge-sso-button
        [connection]="connection"
        (success)="onSuccess()"
        (error)="onError($event)"
      >
        <bridge-sso-provider-icon [type]="connection.type" />
      </bridge-sso-button>
    }
  `,
})
export class CustomLoginComponent {
  connections: FederationConnection[] = [];

  onSuccess(): void {
    console.log('SSO login complete');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

**`bridge-sso-provider-icon` (`SsoProviderIconComponent`)** renders the brand SVG for a connection's provider `type` (`google`, `ms-azure-ad`, `linkedin`, `facebook`, `github`, `apple`):

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `string` | **(required)** | Federation connection type, e.g. `connection.type` |
| `className` | `string` | `''` | Forwarded to the root `<span>`'s `class` |
| `style` | `string` | `''` | Forwarded to the root `<span>`'s `style` |

## SSO mode: redirect vs popup

Both `bridge-login-form` and standalone `bridge-sso-button` support two SSO kickoff strategies via the `ssoMode` / `mode` input:

| Mode | What happens | When to use |
|------|--------------|-------------|
| `'redirect'` **(default)** | Clicking the button navigates the current tab to the Bridge federation endpoint. The user is sent to the provider (Google, Microsoft, etc.), signs in, and the OAuth callback chain returns them to your app via the normal route guard flow. No popup, no cross-window messaging. | Almost all apps. This is the safest, most compatible default — pop-up blockers, mobile browsers, embedded webviews, and strict CSPs all work out of the box. The route guard automatically completes the auth transition when the user lands back on a protected route. |
| `'popup'` | Clicking the button opens `window.open()` to the Bridge federation endpoint with `mode=popup`. The popup completes the provider flow and `postMessage`'s the result back to the opener, which resolves the underlying `startSsoLogin()` promise. The host page never unloads. | Embedded widgets, multi-tab dashboards, or flows that must preserve unsaved state on the host page. Requires `targetOrigin` to match your app origin (handled automatically). Pop-up blockers may interfere — handle `(error)` for the "popup blocked" case. |

**Redirect mode example:**

`bridge-login-form`:

```html
<bridge-login-form />
<!-- or explicitly -->
<bridge-login-form ssoMode="redirect" />
```

`bridge-sso-button`:

```html
<bridge-sso-button [connection]="connection" />
<!-- or explicitly -->
<bridge-sso-button [connection]="connection" mode="redirect" />
```

In redirect mode, `(success)` / `(login)` do **not** fire on the original page — it's already navigating away. Instead, rely on your route guard + `AuthService.authState()` transitions to pick up the session once the user lands back in your app.

**Popup mode example:**

`bridge-login-form`:

```html
<bridge-login-form ssoMode="popup" />
```

`bridge-sso-button`:

```ts
import { Component } from '@angular/core';
import { SsoButtonComponent } from '@nebulr-group/bridge-angular';
import type { FederationConnection } from '@nebulr-group/bridge-auth-core';

@Component({
  selector: 'app-popup-sso',
  standalone: true,
  imports: [SsoButtonComponent],
  template: `
    <bridge-sso-button
      [connection]="connection"
      mode="popup"
      (success)="onSuccess()"
      (error)="onError($event)"
    />
  `,
})
export class PopupSsoComponent {
  connection!: FederationConnection;

  onSuccess(): void {
    console.log('popup auth complete');
  }

  onError(err: Error): void {
    if (err.message.includes('popup')) {
      // popup was blocked — prompt the user to allow popups
    }
  }
}
```

In popup mode, the underlying promise resolves with the final auth result (or rejects if the popup is blocked, closed, or times out after 5 minutes), so `(success)` and `(error)` fire as expected.

**Under the hood:** both modes hit the same backend endpoint `GET /auth/auth/federation/:appId?provider=<type>`. Popup mode additionally sends `mode=popup&targetOrigin=<origin>` query params, which the backend uses to route the final callback into a `postMessage` instead of a normal redirect.
