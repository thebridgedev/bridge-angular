# Getting the user token

The user's token is set the moment they sign in — through `<bridge-login-form>`, `<bridge-sso-button>`, a passkey, magic link, or the hosted redirect — and Bridge keeps it valid from then on. You never fetch or store it yourself.

## The recommended path: the unified `BridgeService` surface

For almost everything you build, read the signed-in user from `BridgeService.user` — it's a live, reactive signal and requires no setup beyond `provideBridge()`:

```ts
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-account',
  standalone: true,
  template: `
    @if (bridge.user(); as user) {
      <p>{{ user.email }} — {{ user.role }}</p>
    }
  `,
})
export class AccountComponent {
  protected readonly bridge = inject(BridgeService);
}
```

`bridge.user()` exposes:

| Field | Type | Description |
|-------|------|--------------|
| `id` | `string` | The user's unique identifier |
| `email` | `string \| undefined` | The user's email |
| `role` | `string` | The user's role within the current tenant |
| `tenantId` | `string` | The current workspace's ID |

It's populated from the live channel's session snapshot on connect and every reconnect, so it's always current — see [How the user token is updated](/auth/user-token/object-updates/).

## Richer profile fields: `ProfileService`

`bridge.user` is intentionally minimal. For display fields like full name, avatar-worthy details, or tenant name/logo, inject `ProfileService`:

```ts
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
|-------|------|--------------|
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

`ProfileService.profile` is `undefined` while loading, `null` when not authenticated, and a `Profile` object when authenticated. It re-derives automatically on login and on workspace switch. It is **not** re-fetched automatically for an arbitrary server-side profile edit pushed while the app is already open — call `authService.getBridgeAuth().getProfile()` for a one-off fresh read (for example, right after the user edits their own name in a form you built) if you need the very latest values before the next login/switch. `<bridge-profile-name>` (`ProfileNameComponent`) is a ready-made component if you just need to render the name somewhere.

## The alternative path: `AuthService.tokens`

You almost never need this. Bridge's own SDK calls already carry the token automatically — every request the SDK makes to the Bridge API gets `Authorization: Bearer <token>` injected for you.

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

`AuthService.tokens()` holds a `TokenSet` — `{ accessToken, refreshToken, idToken }`, the raw JWTs — or `null` when signed out. Bridge refreshes them automatically before they expire, and proactively after your app reconnects from being offline, so you never manage token lifetimes yourself.
