import type { Type } from '@angular/core';
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
   * Base URL for the Bridge API. Used by the auth runtime, Feature Flags 2.0 and
   * the realtime runtime (live updates channel).
   * Unset (or empty) means production. Set it for a stage, local or
   * self-hosted app — an app id from another environment against production
   * fails with "app not found".
   * @default 'https://api.thebridge.dev'
   *
   * Angular has no environment-variable convention, so configuration stays in
   * code: pass it from your own `environment.ts`.
   */
  apiBaseUrl?: string;

  /**
   * Base URL of Bridge's hosted sign-in pages (hosted mode). On Bridge's own
   * domains it follows `apiBaseUrl` (`api-stage.thebridge.dev` →
   * `auth-stage.thebridge.dev`), so set it only for a local or self-hosted
   * Bridge.
   * @default derived from `apiBaseUrl`, else 'https://auth.thebridge.dev'
   */
  hostedUrl?: string;

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
   * Billing destinations and the upgrade dialog. Mirrors bridge-svelte's
   * `billing` config (TBP-702/703). Every route defaults to a page
   * `bridgeBillingRoutes()` serves.
   */
  billing?: {
    /**
     * Where a signed-in workspace with no plan is redirected before a protected
     * route renders. The default applies only to an app that has plans (an app
     * without billing has only plan-less workspaces); a value set here always
     * applies. `false` turns the redirect off. Workspaces of an app with
     * `paymentsAutoRedirect` off are never redirected.
     * @default '/subscription/plan'
     */
    paywallRoute?: string | false;
    /**
     * Where a failed Stripe checkout confirmation lands.
     * @default '/subscription/error'
     */
    paymentErrorRoute?: string;
    /**
     * The subscription page — the default destination of the Upgrade/Manage
     * CTA in `<bridge-quota-banner>`, `<bridge-billing-notice>`,
     * `<bridge-quota-gate>` and the upgrade dialog. A completed checkout lands
     * on `<manageRoute>/success` by default.
     * @default '/subscription'
     */
    manageRoute?: string;
    /**
     * The dialog `provideBridge()` mounts, which opens when your backend refuses
     * a request because a plan limit is reached (`402` with
     * `code: 'QUOTA_EXCEEDED'`, what bridge-nestjs's `@RequireQuota` sends) or
     * a plan feature is missing (`402 FEATURE_NOT_IN_PLAN`), and when someone
     * reaches a route whose flag is off because of the plan. `false` turns it
     * off (listen with `onBridgeQuotaExceeded()` instead); a standalone
     * component replaces it and receives {@link BridgeUpgradeDialogInputs} as
     * inputs.
     * @default true
     */
    upgradeDialog?: boolean | Type<unknown>;
    /**
     * Origins of your own backend when it is not on the page's origin, e.g.
     * `['https://api.example.com']`. `bridgeInterceptor` attaches the user's
     * token to, and reads plan-limit refusals from, the page's origin, Bridge's
     * API and these origins only.
     */
    apiOrigins?: string[];
  };
}

/**
 * The inputs a replacement upgrade dialog (`billing.upgradeDialog: MyDialog`)
 * receives — the same the built-in `<bridge-upgrade-dialog>` takes.
 */
export interface BridgeUpgradeDialogInputs {
  /** The plan-limit refusal to explain, or null (the feature variant, or closed). */
  refusal: import('../billing/quota-refusal').BridgeQuotaRefusal | null;
  /** With no refusal: the feature (or flag) the plan does not include. */
  feature: string | null;
  /** Where the Upgrade button goes: the refusal's `fix`, else `billing.manageRoute`. */
  upgradeHref: string;
  /** True when the signed-in user may manage billing; a member is told to ask the owner. */
  canUpgrade: boolean;
  /** The plan catalogue, for "Included in" — null until loaded. */
  plans: ReadonlyArray<import('@nebulr-group/bridge-auth-core').Plan> | null;
  /** Call to close the dialog. */
  onclose: () => void;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}
