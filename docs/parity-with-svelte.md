# bridge-angular — parity with bridge-svelte

The Angular column of the TBP-515 parity matrix. Rows are bridge-svelte 0.9.0's public surface (`bridge-svelte/src/lib/index.ts` on `origin/main`); each cell says whether bridge-angular has it, whether it was added by the TBP-744 change, or why it deliberately differs. "Different" always means the same behaviour and contract in the idiomatic Angular form, not a missing feature.

Legend: **present** (already on `main` before TBP-744) · **added** (TBP-744 / this PR) · **different** (same contract, Angular form — reason given).

## Setup and configuration

| bridge-svelte | bridge-angular | Status |
|---|---|---|
| `bridgeBootstrap(config)` root `load` | `provideBridge(config, routeConfig?)` (`APP_INITIALIZER`) | different — Angular boots through providers, not a route `load` |
| `<BridgeBootstrap>` shell (readiness, dev badge, upgrade dialog) | `provideBridge()` mounts the dev badge and the upgrade dialog via `APP_BOOTSTRAP_LISTENER` | present (badge) · added (dialog) — Angular has no provider component |
| Config precedence: explicit option > env > default; empty = unset; missing app id throws naming it | explicit option > default; empty = unset; missing `appId` throws naming it | added — **different**: no env step, Angular has no env-var convention (config stays code-based, per TBP-744) |
| `hostedUrl` follows `apiBaseUrl` on Bridge domains | `hostedUrl` option, derived, passed to auth-core | added |
| Dev warning: running against production / hosted pages not derivable | same, `isDevMode()` only | added |
| `resolveBridgeConfig` (internal) | `resolveBridgeConfig`, `hostedUrlFor` exported | added |

## Auth

| bridge-svelte | bridge-angular | Status |
|---|---|---|
| `<BridgeAuthRoutes>` in `auth/[...bridge]` — every sign-in page from one file | `...bridgeAuthRoutes()` — a lazy `Routes` array | added — **different**: Angular routing is a route table, so the "one file" is one spread |
| Pages: login, signup, oauth-callback, set-password/[token], forgot-password, magic-link, setup-passkey/[token], workspaces | same eight | added |
| Unknown segment → the app's 404 | falls through to the app's `**` route | added |
| Rung 2: `frame` / `heading` snippets | `frame` (layout component with `<router-outlet>`) / `heading(page)` option | added — **different**: snippets have no Angular equivalent across a route boundary; a layout route is the idiom |
| Rung 3: a specific route file wins over `[...bridge]` | `overrides: { login: {…} }`, or an app route before the spread | added |
| Hosted mode: each page points at the hosted login | same | added |
| OAuth callback + Stripe return handling in the root `load` | the `oauth-callback` page does it (`resolveCallbackTarget`) | added — **different**: no root `load`; the callback page owns it |
| `BRIDGE_AUTH_PAGES`, `parseBridgeAuthRoute` | `BRIDGE_AUTH_PAGES`; parsing is the router's | added / different — the router matches paths |
| Route guard rules (`match`, `public`, `featureFlag`, `redirectTo`), return-to, flag reasons, re-check on authorization change | `bridgeAuthGuard()` | present |
| Sign-in pages need a public rule | pages carry `data.bridgePublic`, honoured by the guard | added — **different**: stricter default, no rule needed |
| `LoginForm`, `SignupForm`, `ForgotPassword`, `MagicLink`, `MfaChallenge`, `MfaSetup`, `TenantSelector`, `WorkspaceSelector`, `SsoButton` | `<bridge-login-form>` … standalone components | present |
| Passkeys: `PasskeyLogin`, `PasskeySetup`, `PasskeyRequestSetupLink` | same | present |
| i18n (`locale`, `messages`, `createTranslator`) | same | present |
| `readReturnTo`, `withReturnTo`, `sanitizeReturnTo` | re-exported | present |
| Stores: `isAuthenticated`, `tokenStore`, `profileStore`, … | `AuthService` / `ProfileService` signals | different — Angular signals + DI instead of Svelte stores |

## Plan limits and billing

| bridge-svelte | bridge-angular | Status |
|---|---|---|
| `<BridgeBillingRoutes>` in `subscription/[...bridge]` | `...bridgeBillingRoutes()` | added |
| Defaults `manageRoute /subscription`, `paywallRoute /subscription/plan` (apps with plans only), `paymentErrorRoute /subscription/error`; `paywallRoute: false` | same | added (breaking: were `/billing`, unset, `/payment-error`) |
| `BRIDGE_BILLING_PAGES`, `BRIDGE_BILLING_DEFAULTS` | same, plus `resolveBillingPaths` | added |
| `<BridgePaywallPage>` | `<bridge-paywall-page>` | added |
| `<BillingPortalButton>` | `<bridge-billing-portal-button>` | added |
| `<PlanSelector>` | `<bridge-plan-selector>` | present |
| S2 `planCard` snippet (`plan, prices, isCurrent, interval, onPick`) | `planCardTemplate` (`ng-template`) | present · `interval` added |
| S2 `planDescription`, `planFooter` snippets | `planDescriptionTemplate`, `planFooterTemplate` | added |
| `emptyState`, `loadingState` snippets | `emptyStateTemplate`, `loadingStateTemplate` | present |
| Interval tabs, `defaultInterval`, cheapest-first, feature list | same | added |
| Free pick goes on to `successRedirect` (TBP-762) | same, unless `(select)` is observed | added |
| Plan-change confirmation dialog (TBP-33) | not ported | gap — a paying workspace’s switch still runs on click; noted on TBP-515 |
| `<BridgeSubscriptionStatus>`, `<BridgeBillingNotice>`, `<BridgePaywall>`, `<BridgeQuotaBanner>` | same | present |
| Level 0: global `fetch` wrapper + `bridgeFetch` → upgrade dialog on `402` | `bridgeInterceptor` (HttpClient) + `bridgeFetch` | added — **different**: Angular apps call APIs through `HttpClient`; an interceptor is the idiom, and it sends the token only to watched origins |
| `<BridgeUpgradeDialog>`, `billing.upgradeDialog` (`false` / component), `billing.apiOrigins` | `<bridge-upgrade-dialog>`, same options | added |
| `onBridgeQuotaExceeded`, `parseQuotaRefusal`, `openFeatureUpgrade`, `dismissFeatureUpgrade`, `featureUpgrade`, `parseFeatureRefusal` | same (state as signals) | added |
| Plan-gated route opens the feature variant | same (guard) | added |
| Level 1: `<QuotaGate metric>` with `atLimit` snippet | `<bridge-quota-gate metric>` with `*bridgeQuotaAtLimit`, plus `[bridgeQuotaGate]` on one control | added |
| `<FeatureFlag upgrade>` + `openUpgrade` in the fallback | `<bridge-feature-flag [upgrade]>` + `openUpgrade` in the fallback context | added |
| `<Entitled to>` (exception) | `*bridgeEntitled="key; else …; loading: …"` | added — structural directive is the Angular form |
| Level 2: `useQuota(metric)` | `injectQuota(metric)` → `Signal<QuotaState>` | added |
| `$entitlements` store (exception) | `injectEntitlements()` → `Signal<EntitlementsState>` | added |
| Dev note on direct plan checks (TBP-705) | same | added |
| `bridge.usage.report / set / getQueueStatus` | `BridgeService.usage` | added |
| Dev warning when backend and page count the same metric (`X-Bridge-Usage-Counted`) | not ported | gap — development-only diagnostic; noted on TBP-515 |

## Styling

| bridge-svelte | bridge-angular | Status |
|---|---|---|
| `--bridge-*` token contract, defaults on `:where(:root)`, deprecated aliases | same stylesheet contract | added (was plain `:root`, fewer tokens) |
| Headless without the stylesheet | same | present |

## Flags, live updates, team, developer

| bridge-svelte | bridge-angular | Status |
|---|---|---|
| `<FeatureFlag>` with off reasons | `<bridge-feature-flag>` + `*bridgeFeatureFlagFallback` | present |
| `useFlag` | `flagSignal` | present |
| `bridge` surface (`app`, `tenant`, `user`, `attributes`, `events`) | `BridgeService` | present |
| `realtimeStatus`, `realtimeStatusDetail`, dev badge | same | present |
| Team panel and sub-components, seats | `<bridge-team-panel>` … | present |
| `ApiTokenManagement` | `<bridge-api-token-management>` | present |
| Reddit / GA4 tracking | same | present |

## Tests

Every row marked **added** has vitest coverage in `bridge-angular/src/lib/**/*.spec.ts`: `routing/ten-line-routing.spec.ts`, `guards/ten-line-guard.spec.ts`, `billing/plan-limits.spec.ts`, `config/resolve-config.spec.ts`, `styles-tokens.spec.ts`, and the S2 block of `components/subscription/plan-selector.component.spec.ts`.
