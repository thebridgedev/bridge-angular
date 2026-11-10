/**
 * TBP-944 (svelte TBP-813) — "a checkout just finished", for whichever page it
 * lands on.
 *
 * A completed checkout used to stop on a confirmation page
 * (`/subscription/success`) before going anywhere. It now lands on
 * `billing.successRoute` (the subscription page by default), and this one-shot
 * signal is how that page knows to say so: `<bridge-checkout-notice>` shows it
 * as a banner, and an app that wants its own message reads `checkoutResult`.
 *
 * In memory only, never in the URL or storage: the checkout return navigates
 * inside the running app, so the signal is still here when the landing page
 * renders, and a reload (or a later visit) does not show it again. Whoever
 * shows it clears it.
 *
 * Plain module-level signals rather than a service, so the OAuth-callback
 * resolver and the plan picker can set it without an injection context, and an
 * app can read it from a template, a `computed` or an `effect`.
 */
import { signal, type Signal } from '@angular/core';

/** What just completed. */
export interface BridgeCheckoutResult {
  /** `checkout`: a paid Stripe checkout returned. `plan`: a plan was set without one (a Free pick). */
  kind: 'checkout' | 'plan';
  /** The plan's name, when the page that set it knew it. Otherwise read the current plan. */
  planName?: string;
}

const result = signal<BridgeCheckoutResult | null>(null);

/** The checkout that just completed, or `null`. Cleared once something shows it. Read-only. */
export const checkoutResult: Signal<BridgeCheckoutResult | null> = result.asReadonly();

/** Record a completed checkout or plan pick. Called by the plugin, not by apps. */
export function markCheckoutComplete(value: BridgeCheckoutResult): void {
  result.set(value);
}

/** Read the result and clear it, so it is shown once. */
export function takeCheckoutResult(): BridgeCheckoutResult | null {
  const value = result();
  if (value) result.set(null);
  return value;
}

/** Forget the result without showing it. */
export function clearCheckoutResult(): void {
  result.set(null);
}
