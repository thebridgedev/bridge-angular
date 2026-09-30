/**
 * TBP-744 — what the OAuth callback page does, as a plain function: the page
 * `bridgeAuthRoutes()` serves at `auth/oauth-callback` calls it and navigates
 * to the answer. Mirrors bridge-svelte's `handleCallbackRoute` (TBP-629/702/762).
 *
 * Three things call back to the same address:
 *   - the hosted login (`?code=`) → exchange it, then the stashed deep link
 *     (TBP-629) or the default route;
 *   - a completed Stripe checkout (`?stripe_success&session_id=`) → confirm it
 *     with bridge-api, re-read billing, then `redirect` (default: the
 *     subscription page); a confirmation that fails lands on the payment-error
 *     page (default `/subscription/error`);
 *   - a cancelled checkout (`?stripe_cancel`) → `redirect`.
 */
import { sanitizeReturnTo } from '@nebulr-group/bridge-auth-core';
import type { BridgeBillingPaths } from './billing-paths';

export interface CallbackDeps {
  handleCallback(code: string): Promise<void>;
  confirmStripeCheckout(sessionId: string): Promise<void>;
  /** Re-read the subscription so the landing page shows the new plan. Never throws. */
  refreshBilling(): Promise<void>;
  /** The deep link stashed before a hosted login (auth-core `takeReturnTo`). */
  takeReturnTo(): string | null;
  logError?(message: string, err: unknown): void;
}

/**
 * Where a checkout return goes: its `redirect` parameter, validated as a
 * same-app path with any query dropped (an older success URL carried the
 * session id inside it), else the subscription page.
 */
export function stripeReturnTarget(params: URLSearchParams, paths: BridgeBillingPaths): string {
  const raw = params.get('redirect');
  if (raw === null) return paths.manageRoute;
  return sanitizeReturnTo(raw.split('?')[0]) ?? paths.manageRoute;
}

/** Handle a callback and say where to go next. */
export async function resolveCallbackTarget(
  params: URLSearchParams,
  paths: BridgeBillingPaths,
  deps: CallbackDeps,
  defaultRoute = '/',
): Promise<string> {
  const code = params.get('code');
  const sessionId = params.get('session_id');

  if (code) {
    try {
      await deps.handleCallback(code);
    } catch (err) {
      deps.logError?.('[bridge] OAuth callback failed', err);
      return defaultRoute;
    }
    const payment = params.get('payment');
    // `payment` wins: a just-completed checkout whose landing the billing flow owns.
    if (payment) return `${defaultRoute}${defaultRoute.includes('?') ? '&' : '?'}payment=${encodeURIComponent(payment)}`;
    return deps.takeReturnTo() ?? defaultRoute;
  }

  if (params.has('stripe_success') && sessionId) {
    try {
      await deps.confirmStripeCheckout(sessionId);
    } catch (err) {
      deps.logError?.('[bridge] checkout confirmation failed', err);
      return paths.paymentErrorRoute;
    }
    await deps.refreshBilling().catch(() => {});
    return stripeReturnTarget(params, paths);
  }

  if (params.has('stripe_cancel')) return stripeReturnTarget(params, paths);

  return defaultRoute;
}
