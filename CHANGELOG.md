# Changelog

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
