# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-09-30

### Added

- **Sign-in and subscription pages as one route module.** Spread a single route array into your router to get the sign-in, subscription and paywall pages, and override any one route when you need your own.
- **Plan-limit and entitlement directives.** Directives show, disable or hide parts of a template based on the workspace's plan limits and entitlements, and a request refused because the plan does not allow it opens the upgrade dialog.
- **A feature that is off says why.** A refused route or a flag fallback now learns the reason: not on the plan opens the upgrade dialog, not allowed for this person tells them to ask an admin, and switched off simply hides it.
- **Seat limits on the built-in team page.** The team page stops invitations once the workspace reaches the seat limit of its plan.

### Changed

- **Requires auth-core 0.8.0.** Configuration precedence and the `--bridge-*` styling variables now follow the same rules as the other Bridge plugins.

### Fixed

- **Subscription status right after checkout.** Billing and plan-limit screens renew an out-of-date sign-in and retry, so returning from Stripe checkout shows the new plan instead of "Subscription unavailable" until a reload.
- **Live updates during a reconnect.** A change to a person's plan or access that arrives while the live connection is reconnecting is no longer lost.

## [0.7.4] - 2026-09-26

### Fixed

- **Session snapshot on first connection.** After sign-in, the workspace name and id, branding and entitlements now appear immediately. Previously they stayed empty on a first connection, so every entitlement check answered no and a paywall built on one would lock everyone out.
- **Live updates and usage reporting in the browser.** Live updates now connect, so plans, entitlements and usage counters refresh without a page reload, and usage reported from the browser is delivered. Previously the browser rejected these calls and browser-reported usage was lost.
- **Documentation links.** Three pages in the published guides linked to addresses with no page behind them; they now resolve.

## [0.1.0] - 2026-02-24

### Added

- Initial release of `@nebulr-group/bridge-angular`.
- `provideBridge(config, routeConfig)` — `APP_INITIALIZER`-based setup that refreshes tokens, loads feature flags, and starts auto-refresh before the app renders.
- `AuthService` — Angular Signals-based auth state (`isAuthenticated`, `isLoading`, `tokens`), login/logout, OAuth callback exchange, and automatic token refresh.
- `ProfileService` — JWT verification via JWKS; exposes `profile`, `isOnboarded`, and `hasMultiTenantAccess` signals that auto-sync with `AuthService`.
- `FeatureFlagService` — bulk-evaluate endpoint with 5-minute cache; `isFeatureEnabled(flag, forceLive?)` for single-flag checks.
- `PlanService` — `redirectToPlanSelection()` (handover protocol) and `setSecurityCookie()` for subscription portal redirects.
- `bridgeAuthGuard()` — functional Angular route guard (`canActivateChild`) with string, wildcard, and RegExp pattern matching, feature-flag gating (`featureFlag: string | { any } | { all }`), and `defaultAccess` fallback.
- `LoginComponent` (`<bridge-login>`) — pre-built login button.
- `FeatureFlagComponent` (`<bridge-feature-flag>`) — declarative flag-gated rendering with `flagName`, `forceLive`, `negate`, and `renderWhenDisabled` inputs.
- `TeamManagementComponent` (`<bridge-team-management>`) — embedded team management portal via handover iframe.
- `BridgeConfigService` — injectable config accessor.
- Full Playwright E2E suite mirroring bridge-svelte: auth, bootstrap, feature-flags, route-guard, and team-management.
- Install test: `npm run test:install` and CI workflow to verify the packed package installs with Angular 19.
- Learning docs: quickstart guide and full examples reference in `learning/`.

[0.1.0]: https://github.com/thebridgedev/bridge-angular/releases/tag/v0.1.0
