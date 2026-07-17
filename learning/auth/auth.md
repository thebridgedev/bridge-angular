# Authentication

Bridge gives your Angular app a complete authentication system without you building one: sign-in flows (email and password, magic link, passkeys, Google and Azure AD SSO, MFA), signup, drop-in UI components for all of them, route protection, roles and privileges, multi-workspace support, and self-service API tokens. You configure what's enabled in Control Center (your admin dashboard at app.thebridge.dev) or the CLI; the SDK components pick it up automatically.

## The mental model

Three ideas carry the whole section:

- **The `BridgeService`.** One injectable service that exposes the signed-in user and their workspace as reactive signals: `bridge.user` (id, email, role, tenantId) and `bridge.tenant.*` (the workspace; a workspace is called a *tenant* in the API). Read them as signal calls and your UI stays current.
- **Auth states.** A single `authState` signal tracks where the user is in the login flow, from `'unauthenticated'` through steps like `'mfa-required'` and `'tenant-selection'` to `'authenticated'`. The drop-in `<bridge-login-form>` walks these states for you; you can also branch on them yourself. See [Auth states](/auth/user-token/auth-states/).
- **The live channel.** A persistent realtime connection the SDK maintains. When a role, plan, or permission changes server-side, Bridge pushes the change down the channel and your signals update in place, with no reload or polling. See [Live Updates](/live-updates/).

Sessions are JWT-based: signing in stores a token set in `localStorage`, and Bridge refreshes it before expiry. Signing out erases the stored token. See [Logging in and logging out](/auth/user-token/logging-in-and-out/).

## Enabling sign-in methods

Each method is a per-app setting, flipped on in Control Center or via the CLI:

- [Email & password](/auth/sign-in/email-password/) (on by default)
- [Magic link](/auth/sign-in/magic-link/)
- [Passkeys](/auth/sign-in/passkeys/)
- [Google SSO](/auth/sign-in/google-sso/)
- [Azure AD SSO](/auth/sign-in/azure-ad/)
- [MFA / 2FA](/auth/sign-in/mfa/)

## Drop-in UI components

Every flow has a ready-made component, imported from `@nebulr-group/bridge-angular`. They render inside your app with no external redirects, and all accept `className` and `style` inputs alongside their own inputs and outputs.

| Component(s) | What it does | Docs |
|--------------|--------------|------|
| `bridge-login-form` | Complete login form; handles forgot password, magic link, passkeys, MFA, and workspace selection inline | [Email & password](/auth/ui/email-password/) |
| `bridge-signup-form` | Signup with email, first name, and last name | [Signup](/auth/ui/signup/) |
| `bridge-sso-button` | Standalone SSO button, redirect or popup mode | [SSO login button](/auth/ui/google-sso/) |
| `bridge-magic-link` | Magic link request form | [Magic link](/auth/ui/magic-link/) |
| `bridge-forgot-password` | Request and reset modes for password resets | [Forgot / reset password](/auth/ui/forgot-password/) |
| `bridge-mfa-challenge`, `bridge-mfa-setup` | MFA code challenge and first-time setup | [MFA / 2FA](/auth/ui/mfa/) |
| `bridge-passkey-login`, `bridge-passkey-setup`, `bridge-passkey-request-setup-link` | Passkey (WebAuthn) login and registration | [Passkeys](/auth/ui/passkeys/) |
| `bridge-tenant-selector`, `bridge-workspace-selector` | Pick a workspace at login; switch workspaces later | [Switching workspaces](/auth/ui/switching-workspaces/) |
| `bridge-team-panel` | Invite users, change roles, edit workspace settings | [User & team management](/auth/ui/team-management/) |
| `bridge-api-token-management` | Self-service API token management | [Tokens](/auth/ui/tokens/) |

## Protecting routes

Pass a `RouteGuardConfig` as the second argument to `provideBridge` to mark routes public, protected, or gated behind feature flags or billing, then apply `bridgeAuthGuard()` via `canActivateChild` on the routes you want protected. Unauthenticated users are redirected to Bridge's hosted login page. See [Route guards](/auth/securing/route-guards/) and the [config reference](/auth/config/).

## Identity, roles, and workspaces

- **Reading the user:** `bridge.user` for live identity claims, `ProfileService` for richer display fields, `AuthService.tokens` for the raw JWTs. See [Getting the user token](/auth/user-token/getting-the-token/) and [How the user token is updated](/auth/user-token/object-updates/).
- **Roles and privileges:** every user has exactly one role per workspace; roles bundle privilege keys you define. See [How roles work](/auth/roles/how-it-works/), [Define roles](/auth/roles/define-roles/), [Assign roles](/auth/roles/assign-roles/), [Common setups](/auth/roles/common-setups/), [The owner role](/auth/roles/owner-role/), and [Gate features by role](/auth/roles/gate-with-flags/).
- **Multi-workspace:** one set of credentials, many workspaces, with isolation enforced server-side. See [Multi-tenancy](/auth/multi-tenancy/).
- **API tokens:** let your users mint privilege-scoped tokens for scripts and integrations. See [API tokens](/auth/api-tokens/).
