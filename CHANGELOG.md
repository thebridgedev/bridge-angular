# Changelog

## [0.9.1] - 2026-11-10

### Fixed

- **Paid features are unlocked on the first paint.** A signed-in page now reads the plan's features, the billing state and the flag definitions before Angular renders it (each read capped at 1.5 seconds), so a paying user no longer sees "Upgrade to use this" flash on a plan-gated feature. Flags also re-check when the plan, its features or a plan limit change, so a feature unlocks straight after an upgrade and locks after a downgrade, with no reload.
- **Billing screens stay current.** The plan picker, the subscription badge and the billing notice re-read when the sign-in renews, when a plan or subscription changes in Bridge, and when the tab regains focus after 30 seconds. A plan added or changed in Bridge shows without a reload, and the current plan stays on screen while it re-reads. A plan list that comes back empty or fails to load now offers **Try again** instead of "No plans available."
- **A flag on a route is a live kill switch.** Switching off the flag a route rule names now moves someone already on that page to the rule's `redirectTo` within about a second, without a click. A flag that changed while live updates were down is picked up when they reconnect.

### Changed

- **Guides follow "every gate is a flag".** The billing and feature-flags guides open with the rule and end with `npx @nebulr-group/bridge-cli check gates`. A paid feature is taught as a flag ruled on the plan's feature, with direct plan checks kept as the exception. The guides name the MCP tools next to the CLI commands, the team guide teaches seat limits with `seatsMetric`, and the live-updates page explains each status reason and links the troubleshooting page.
- **The guides are checked against the package.** A test now fails if a guide imports, renders or configures something the package does not have.

## [0.9.0] - 2026-11-10

### Changed

- **After checkout, people land back in the app.** A completed checkout or a Free plan pick now returns to the subscription page with a "You're on Pro now" banner, with no separate confirmation step. Set `billing.successRoute` to land on any page of your app, and put `<bridge-checkout-notice />` there for the same banner, or read the `checkoutResult` signal for a message of your own. The old confirmation page at `/subscription/success` still works for apps that point to it.
- **A subscription page that fits your app.** Plan cards and the current-plan panel have their own surface built from your `--bridge-*` tokens, so they look right on any app background. Prices are shown large and formatted for their currency, buttons say "Upgrade to" or "Switch to", the current plan is marked in your primary colour, and its renewal date and card are shown. Two optional tokens, `--bridge-card-bg` and `--bridge-card-shadow`, tune the cards. Plan buttons no longer read "Select free plan" or "29 USD / month", so tests that match that text need updating.
- **Bridge pages follow your app's text.** Every text size on the sign-in and subscription pages now scales from your page's body text size, alongside the font family and text colour they already inherited. At the usual 16px nothing changes; set `--bridge-font-size` to size Bridge text differently.
- **Your CSS always wins.** Bridge's styles now live in a CSS cascade layer named `bridge`, so any normal CSS you write against a Bridge class or data attribute overrides it, whatever the load order or specificity, with no `!important`. CSS inside one of your own layers declared before `bridge`, including Tailwind utility classes on Bridge's elements, still ranks below it.

### Added

- **Weight and shadow settings.** `--bridge-font-weight-heading`, `--bridge-font-weight-button`, `--bridge-font-weight-label` and `--bridge-button-shadow` let an app with heavy type or hard drop shadows carry that look onto the Bridge pages. `--bridge-card-shadow` also styles the plan-change dialog. Every default is the previous look.
- **The same subscription page as the other Bridge packages.** The Angular pages now match bridge-svelte 0.9.3: the same layout, wording and settings.

## [0.8.1] - 2026-11-04

### Fixed

- **A finished-looking sign-in page.** The show-password toggle on the sign-in and set-password pages is an eye icon instead of an emoji. "Sign in with Passkeys" and "Sign in with Magic Link" carry icons like the other sign-in buttons, and "Sign in with Magic Link" is a button, centred and no longer underlined. The sign-in pages now look the same as in the other Bridge packages.
- **Sign-in links match your app.** "Sign up", "Log in" and the other text links on the sign-in pages take the form's text colour and font, instead of the browser's default blue.
- **Sign-in pages fill your frame.** With `bridgeAuthRoutes({ frame })`, the sign-in pages fill the frame's width and add no padding of their own; before, the form shrank to a narrow column. The login page also no longer adds a "Log in to your account" heading of its own, matching the other packages; set one with `heading`.

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
