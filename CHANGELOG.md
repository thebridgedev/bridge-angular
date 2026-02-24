# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
