# Getting the user token

The user's token is set the moment they sign in (through `<bridge-login-form>`, `<bridge-sso-button>`, a passkey, magic link, or however your app authenticates them) and Bridge keeps it valid from then on. You never fetch or store it yourself.

## The recommended path: the unified `BridgeService`

For almost everything you build, read the signed-in user from `bridge.user`. It's live, reactive, and requires no setup beyond `provideBridge()`:

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-account',
  standalone: true,
  template: `
    @if (bridge.user(); as user) {
      <p>{{ user.email }} ({{ user.role }})</p>
    }
  `,
})
export class AccountComponent {
  protected readonly bridge = inject(BridgeService);
}
```

`bridge.user` exposes:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's unique identifier |
| `email` | `string \| undefined` | The user's email |
| `role` | `string` | The user's role within the current workspace (a workspace is called a *tenant* in the API, hence the next field's name) |
| `tenantId` | `string` | The current workspace's ID |

It's populated from the session snapshot sent over the live channel (a persistent realtime connection the SDK maintains) on connect and every reconnect, so it's always current. See [How the user token is updated](/auth/user-token/object-updates/).

## A one-off imperative read: `getCurrentUser()`

For a single read outside a reactive context (a plain function, an event handler, an analytics call), `bridge.user` is overkill if you don't want a signal just to read a value once. `getBridgeAuth().getCurrentUser()` reads the same claims synchronously, straight off the current access token:

```ts
import { inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

const user = inject(AuthService).getBridgeAuth().getCurrentUser();
// { id, email?, role?, tenantId?, plan? } | null
```

It returns `null` when there's no valid token. Unlike `bridge.user`, it also includes `plan` (the workspace's plan key), so it's a reasonable choice when you need that alongside identity in one synchronous call. It won't update on its own the way `bridge.user` does; call it again to get a fresh read.

## Richer profile fields: `ProfileService`

`bridge.user` is intentionally minimal. For display fields like full name, avatar-worthy details, or workspace name/logo, use `ProfileService.profile`:

```typescript
import { Component, inject } from '@angular/core';
import { ProfileService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-account-header',
  standalone: true,
  template: `
    @if (profileService.profile(); as profile) {
      <h2>{{ profile.fullName }}</h2>
      <p>{{ profile.email }}</p>
    }
  `,
})
export class AccountHeaderComponent {
  protected readonly profileService = inject(ProfileService);
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The user's unique identifier |
| `username` | `string` | Username |
| `email` | `string` | Email |
| `emailVerified` | `boolean` | Email verification status |
| `fullName` | `string` | Full display name |
| `givenName` / `familyName` | `string \| undefined` | First / last name |
| `locale` | `string \| undefined` | The user's locale |
| `onboarded` | `boolean \| undefined` | Whether onboarding is complete |
| `multiTenantAccess` | `boolean \| undefined` | Whether the user can access more than one workspace |
| `tenant` | `{ id, name, locale?, logo?, onboarded? } \| undefined` | The current workspace's details |

Unlike `bridge.user`, `ProfileService.profile` isn't refreshed automatically when something changes server-side. Call `authService.getBridgeAuth().getProfile()` to re-fetch it on demand (for example, right after the user edits their name); the `profile` signal updates from the result.

`ProfileService.profile` is `undefined` while loading, `null` when not authenticated, and a profile object when authenticated.

### Just rendering the name: `bridge-profile-name`

If all you need is the user's display name somewhere in your UI, skip the service and drop in the ready-made component:

```typescript
import { Component } from '@angular/core';
import { ProfileNameComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ProfileNameComponent],
  template: `<bridge-profile-name />`,
  // renders: "John Doe" or "john@example.com" or nothing when not authenticated
})
export class HeaderComponent {}
```

It outputs a `<span>` with a `data-bridge-profile-name` attribute for styling, and accepts `className` and `style` inputs. No configuration needed.

## The alternative path: `AuthService.tokens`

You almost never need this. Bridge's own SDK calls already carry the token automatically; every request the SDK makes to the Bridge API gets `Authorization: Bearer <token>` injected for you.

Reach for `AuthService.tokens` only when you're calling a backend you control that isn't Bridge's API, and it also needs to verify the user:

```ts
import { inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

const authService = inject(AuthService);

const token = authService.tokens()?.accessToken;
await fetch('https://your-own-api.example.com/work', {
  headers: { Authorization: `Bearer ${token}` },
});
```

`AuthService.tokens()` holds `{ accessToken, refreshToken, idToken }`, the raw JWTs. Bridge refreshes them automatically before they expire, and proactively after your app reconnects from being offline, so you never manage token lifetimes yourself.
