/**
 * TBP-744 — where the subscription pages live, and the defaults every billing
 * redirect and button points at. Angular port of bridge-svelte's
 * `client/billing-routes.ts` (TBP-702).
 *
 * The plugin used to redirect a failed checkout to `/payment-error` and point
 * every Manage/Upgrade button at `/billing`, and no guide told anyone to create
 * either page. With `bridgeBillingRoutes()` spread into the router, the defaults
 * below point at pages that exist.
 */
import type { BridgeConfig } from '../types/config';

/** Every page `bridgeBillingRoutes()` serves. `manage` is the base address itself. */
export const BRIDGE_BILLING_PAGES = ['manage', 'plan', 'success', 'error'] as const;

/** One of the pages `bridgeBillingRoutes()` serves. */
export type BridgeBillingPage = (typeof BRIDGE_BILLING_PAGES)[number];

/** Where each billing destination points when the app configures nothing. */
export const BRIDGE_BILLING_DEFAULTS = {
  manageRoute: '/subscription',
  paywallRoute: '/subscription/plan',
  paymentErrorRoute: '/subscription/error',
} as const;

/** The billing destinations in effect. */
export interface BridgeBillingPaths {
  /** The subscription page — where Manage/Upgrade buttons go. */
  manageRoute: string;
  /** Where a plan-less workspace is sent; `null` when the redirect is turned off. */
  paywallRoute: string | null;
  /**
   * True when `paywallRoute` is the built-in default rather than the app's own
   * choice. The default only applies to an app that has plans (see
   * {@link appUsesBilling}), so an app that never set billing up — where every
   * workspace is plan-less — is not sent to a page it does not use.
   */
  paywallIsDefault: boolean;
  /** Where a failed checkout confirmation lands. */
  paymentErrorRoute: string;
  /** Where a completed checkout lands by default: `<manageRoute>/success`. */
  successRoute: string;
}

/**
 * Resolve the billing destinations from a `billing` config block. An unset (or
 * empty) route takes its default; `paywallRoute: false` turns the paywall
 * redirect off.
 */
export function resolveBillingPaths(billing?: BridgeConfig['billing']): BridgeBillingPaths {
  const manageRoute = billing?.manageRoute || BRIDGE_BILLING_DEFAULTS.manageRoute;
  const paywall = billing?.paywallRoute;
  return {
    manageRoute,
    paywallRoute: paywall === false ? null : paywall || BRIDGE_BILLING_DEFAULTS.paywallRoute,
    paywallIsDefault: paywall !== false && !paywall,
    paymentErrorRoute: billing?.paymentErrorRoute || BRIDGE_BILLING_DEFAULTS.paymentErrorRoute,
    successRoute: `${manageRoute.replace(/\/+$/, '')}/success`,
  };
}

/**
 * Whether the app uses billing, for the default paywall: it has at least one
 * plan. Every workspace of an app with no billing is plan-less, so without this
 * the default would send all of its users to `/subscription/plan`.
 */
export function appUsesBilling(plans: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(plans) && plans.length > 0;
}

/**
 * Whether the paywall redirect must leave `pathname` alone: the paywall itself
 * (no loop), and the payment-error page — a plan-less workspace whose checkout
 * failed has to be able to read why.
 */
export function isPaywallExempt(pathname: string, paths: BridgeBillingPaths): boolean {
  return pathname === paths.paywallRoute || pathname === paths.paymentErrorRoute;
}
