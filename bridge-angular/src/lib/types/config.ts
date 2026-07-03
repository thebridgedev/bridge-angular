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
   * Route to redirect to when authentication fails
   * @default '/login'
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
