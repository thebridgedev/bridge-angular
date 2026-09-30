# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — the published package is the built library (TBP-744)

- Every published `@nebulr-group/bridge-angular` so far (0.7.4 included) was the source folder, not the ng-packagr build: no `fesm2022/`, no typings, no `.` export, so an app could not import it. The publish step now publishes `bridge-angular/dist`, a `prepublishOnly` guard refuses to publish the source folder, and CI packs the exact folder the release publishes and fails unless its `package.json` points at built entry points that are in the tarball (`scripts/check-pack.mjs`).

### Fixed — passkeys run the browser ceremony (TBP-744, TBP-515)

- `<bridge-passkey-login>` fetches the options from Bridge, asks the browser's authenticator and sends its answer back; it called `authenticateWithPasskey()` with no answer, so no authenticator was ever asked. It renders nothing where the browser has no WebAuthn, and takes an `autofill` input.
- `<bridge-passkey-setup>` registers a passkey from the emailed link (registration options for the token, a new credential, verification); it called a `registerPasskeyWithToken()` auth-core does not have, so every setup link ended in "Passkey setup failed." It now says when a link expired (with an `(expired)` output — the built-in page sends the person back to sign-in), was cancelled, or the browser cannot do passkeys.
- `<bridge-passkey-request-setup-link>` calls auth-core's `requestPasskeySetupLink`; `sendPasskeySetupLink` never existed.
- No passkey on this device: `<bridge-login-form>` asks for the email in place and mails a setup link, like bridge-svelte. It used to send the person to `/auth/setup-passkey`, which `bridgeAuthRoutes()` does not serve. `passkeySetupHref` no longer has a default; set it to keep a page of your own.
- `@simplewebauthn/browser` is now a dependency (loaded on first use).

### Added — the ten-line integration (TBP-744)

- `bridgeAuthRoutes(options?)` — a lazy `Routes` array (`loadComponent`) the app spreads into its router: login, signup, the OAuth callback, set password, forgot password, magic link, passkey setup and workspace selection under `/auth`. The pages are public by construction (`data.bridgePublic`, honoured by `bridgeAuthGuard`); an unknown address falls through to the app's own `**`. Customisation rungs: `--bridge-*` tokens; `frame` (a layout component) and `heading(page)`; `overrides: { login: { component } }` or an app route placed before the spread to replace one page. The OAuth callback page also confirms a returning Stripe checkout.
- `bridgeBillingRoutes(options?)` — the subscription page, the paywall `/subscription/plan`, and the checkout return pages `/subscription/success` and `/subscription/error`, the same way.
- `<bridge-paywall-page>` for an onboarding paywall at an address of the app's choosing, and `<bridge-billing-portal-button>` (Stripe billing portal, owner only).
- The upgrade dialog (`<bridge-upgrade-dialog>`), mounted by `provideBridge()`: opens on a `402 QUOTA_EXCEEDED` or `402 FEATURE_NOT_IN_PLAN` from the app's backend, on a route whose flag is off because of the plan, and on a `<bridge-feature-flag [upgrade]>` click. `billing.upgradeDialog: false` turns it off; a component replaces it (`BridgeUpgradeDialogInputs`). `onBridgeQuotaExceeded()` for apps that show something else.
- `bridgeInterceptor` (`HttpInterceptorFn`) and `bridgeFetch()` — the user's token on calls to the page's origin, Bridge's API and `billing.apiOrigins` (never a third party), one refresh-and-retry on a `401`, and the upgrade dialog on a plan-limit `402`.
- Level 1: `<bridge-quota-gate metric>` (with `*bridgeQuotaAtLimit`), `[bridgeQuotaGate]`, `*bridgeEntitled="key; else …; loading: …"`, and an opt-in `[upgrade]` prompt plus `openUpgrade()` in the fallback context of `<bridge-feature-flag>`.
- Level 2: `injectQuota(metric)` and `injectEntitlements()` signals (no number until there is a real one; fail-closed entitlements).
- `hostedUrl` config option, derived from `apiBaseUrl` on Bridge's own domains, and passed to auth-core — a stage app's hosted sign-in no longer opens on production. `resolveBridgeConfig()` / `hostedUrlFor()` exported.
- `<bridge-plan-selector>` (TBP-515 S2 parity): `planDescriptionTemplate`, `planFooterTemplate`, `interval` in the `planCardTemplate` context, `defaultInterval` and interval tabs, cheapest-first ordering, the plan's feature list, and "Manage billing" opens the Stripe portal.
- `BridgeService.usage` (`report` / `set` / `getQueueStatus`) — browser usage counting, parity with svelte's `bridge.usage`.
- `<bridge-plan-selector>` asks before switching a workspace that already pays (svelte TBP-33): a "Change plan?" dialog names both plans and the price; the switch runs only on confirm, a failure shows inside the dialog, and success shows a notice. **Behaviour change:** a click no longer switches the plan straight away.
- Development-only warning when a metric is counted twice — by the backend (`X-Bridge-Usage-Counted`, read by `bridgeInterceptor` / `bridgeFetch`) and by the page (`BridgeService.usage`). Nothing is recorded or printed in production.
- `learning/mechanisms.md` and `docs/parity-with-svelte.md`.

### Changed — BREAKING

- `billing.manageRoute` defaults to `/subscription` (was `/billing`) and `billing.paymentErrorRoute` to `/subscription/error` (was `/payment-error`) — the pages `bridgeBillingRoutes()` serves. Apps that relied on the old defaults set them explicitly.
- The paywall redirect is on by default for an app that has plans, to `/subscription/plan`. `billing: { paywallRoute: false }` turns it off; an explicit route behaves as before.
- A Free pick in `<bridge-plan-selector>` now goes on to `successRedirect` unless the page listens to `(select)`.
- `styles.css` follows the shared `--bridge-*` token contract: defaults sit on `:where(:root)` (an app's `:root` always wins), new tokens (`--bridge-bg`, `--bridge-overlay`, info/warning alerts, page layout), and billing components read tokens instead of fixed colours. `--bridge-primary-foreground` and `--bridge-bg-muted` remain as deprecated aliases.
- Configuration: an empty string counts as unset, and a missing `appId` throws an error naming the option.

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
