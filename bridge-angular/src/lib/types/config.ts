import type { MessageOverrides, ReturnToConfig } from '@nebulr-group/bridge-auth-core';

export interface BridgeConfig {
  /**
   * Your Bridge application ID
   * @required
   */
  appId: string;

  /**
   * The URL to redirect to after successful login
   * @default The current origin + '/auth/oauth-callback'
   */
  callbackUrl?: string;

  /**
   * The base URL for Bridge auth services
   * @default 'https://api.thebridge.dev/auth'
   */
  authBaseUrl?: string;

  /**
   * Route to redirect to after login
   * @default '/'
   */
  defaultRedirectRoute?: string;

  /**
   * In-app login route. When set (SDK mode), the route guard redirects an
   * unauthenticated user hitting a protected route to this in-app route instead
   * of the hosted auth portal. When unset (hosted mode, the default), the guard
   * redirects to the hosted auth portal via `createLoginUrl()`. Mirrors
   * bridge-svelte's `loginRoute`.
   * @default undefined (hosted mode)
   */
  loginRoute?: string;

  /**
   * Base URL for bridge cloud-views service (for plan selection, payments, feature flags, etc.)
   * @default 'https://api.thebridge.dev/cloud-views'
   */
  cloudViewsUrl?: string;

  /**
   * Base URL for the Bridge API. Used by the Feature Flags 2.0 SDK and the
   * realtime runtime (live updates channel). Distinct from `authBaseUrl`
   * (which includes the `/auth` path) and `cloudViewsUrl`.
   * @default 'https://api.thebridge.dev'
   * @env NG_APP_BRIDGE_API_BASE_URL
   */
  apiBaseUrl?: string;

  /**
   * Debug mode
   * @default false
   */
  debug?: boolean;

  /**
   * Show the "Live updates off — why?" corner badge that `provideBridge()`
   * mounts while realtime is refused, degraded or stuck retrying (TBP-644).
   * It only ever renders in development mode (`isDevMode()`); set `false` to
   * hide it there too. Production builds never show it.
   * @default true
   */
  devBadge?: boolean;

  /**
   * UI language for the SDK auth components, e.g. 'sv' or 'sv-SE' (TBP-630).
   * Region variants resolve to their primary subtag; an unknown locale falls
   * back to English rather than throwing.
   * @default 'en'
   */
  locale?: string;

  /**
   * Per-key copy overrides applied on top of the resolved locale, for wording
   * an app genuinely needs to differ. Highest precedence in the chain, and
   * layered under each component's own `messages` input.
   */
  messages?: MessageOverrides;

  /**
   * Deep-link preservation for `bridgeAuthGuard()` (TBP-629).
   *
   * When the guard turns an unauthenticated visitor away, the page they asked
   * for is remembered and restored after login. On by default — set
   * `{ enabled: false }` to send every login to the same place.
   *
   * `loginRoute` is filled in from the top-level `loginRoute` above, so the
   * login route never becomes its own return target without you repeating
   * yourself.
   */
  returnTo?: ReturnToConfig;

  /**
   * Billing paywall configuration. When set, Bridge redirects an authenticated
   * tenant that has not selected a plan to `paywallRoute` before a protected
   * route renders (gated on `getSubscriptionStatus()` →
   * `shouldSelectPlan && paymentsAutoRedirect !== false`). Mirrors
   * bridge-svelte's `billing` config.
   */
  billing?: {
    /**
     * Route to redirect to when the tenant has no plan selected.
     * e.g. '/welcome' or '/subscription'
     */
    paywallRoute?: string;
    /**
     * Route to redirect to when a Stripe checkout confirmation fails.
     * @default '/payment-error'
     */
    paymentErrorRoute?: string;
    /**
     * Route where your plan/billing management page lives — the default
     * destination of the Upgrade/Manage CTA in `<bridge-quota-banner>` and
     * `<bridge-billing-notice>`.
     * @default '/billing'
     */
    manageRoute?: string;
  };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}
