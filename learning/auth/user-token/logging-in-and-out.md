# Logging in and logging out

Bridge auth is **JWT-based**. Signing in gets the browser a token set (`accessToken`, `refreshToken`, `idToken`), stored in `localStorage` by the `BridgeAuth` runtime that `AuthService` wraps. Everything else — staying signed in across reloads, staying signed in across tabs, silently refreshing before expiry — follows from that one fact.

## How logging in works

When `provideBridge()` bootstraps your app (an `APP_INITIALIZER` that runs `BridgeBootstrapService`), it constructs the `BridgeAuth` singleton and immediately checks `localStorage` for a stored token. That check is what decides whether the user sees the app or the login flow:

- **A token is there** — `AuthService.tokens` and `authState` are seeded from it immediately (no round-trip to check it first), and the bootstrap service calls `maybeRefreshNow()` right after, which refreshes in the background if the token is close to expiring — so it's valid again before you'd ever notice. This is why reloading the page doesn't bounce a signed-in user back to login.
- **No token is there** — `authState` starts at `'unauthenticated'` and the login flow takes over (see [Sign-in methods](/auth/sign-in/email-password/) and [Auth states](/auth/user-token/auth-states/)).

If a refresh ever fails (the refresh token itself has expired or been revoked), `BridgeAuth` clears the stored token and `AuthService` drops the user back to `'unauthenticated'` — the same as an explicit logout.

## Logging out

Logging out is just erasing the stored token — there's no server-side session to invalidate first, since JWTs aren't revocable server-side the way a session cookie is. Call `AuthService.logout()`:

```ts
import { Component, inject } from '@angular/core';
import { AuthService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-logout-button',
  standalone: true,
  template: `<button (click)="handleLogout()">Log out</button>`,
})
export class LogoutButtonComponent {
  private readonly authService = inject(AuthService);

  async handleLogout(): Promise<void> {
    await this.authService.logout();
  }
}
```

`authService.logout()` clears the token from `localStorage`, resets `tokens` / `profile` / `authState` back to signed-out values so subscribers re-render immediately, and then redirects the browser to Bridge's hosted logout page.

If you need to send the browser to a specific in-app route instead of the hosted logout page, call the underlying `BridgeAuth` instance directly with `redirectTo`:

```ts
await this.authService.getBridgeAuth().logout({ redirectTo: '/' });
```
