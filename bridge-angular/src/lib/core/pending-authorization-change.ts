/**
 * TBP-654 (upgrade race) — the token refresh an authorization-affecting event
 * started, and the bounded wait route decisions take on it.
 *
 * The page learns about a plan change (and shows the new plan) a few hundred ms
 * before the access token that carries it arrives. A route decision taken in
 * that window is evaluated with the old token and refuses the page the user
 * can already see they have. `BridgeRuntimeService` registers the refresh it
 * starts on `subscription.plan_changed`, `entitlements.changed`,
 * `user.state_changed` or a plan change recovered after a reconnect; the route
 * guard waits for it, bounded, before deciding.
 *
 * Port of bridge-svelte's `auth/guard-cache.ts` pending-change half. Module
 * state, like the rest of the guard: there is one session per page.
 */

/**
 * How long a route decision waits for the token refresh a plan, entitlements or
 * user-state change started. Past it the guard decides with the token it has,
 * which for a protected route is the old (fail-closed) verdict.
 */
export const AUTHORIZATION_CHANGE_WAIT_MS = 3_000;

let _pendingChange: Promise<void> | null = null;

/**
 * Register the token refresh started by an authorization-affecting event.
 * The tracked promise never rejects; it clears itself once settled.
 */
export function trackAuthorizationChange(refresh: Promise<unknown>): Promise<void> {
  const tracked: Promise<void> = refresh
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      if (_pendingChange === tracked) _pendingChange = null;
    });
  _pendingChange = tracked;
  return tracked;
}

/** The refresh in flight for an authorization change, or `null` when there is none. */
export function pendingAuthorizationChange(): Promise<void> | null {
  return _pendingChange;
}

/** Forget any pending change (runtime stop / test reset). */
export function clearPendingAuthorizationChange(): void {
  _pendingChange = null;
}

/**
 * Wait until no authorization-change refresh is in flight, or until `deadline`
 * (epoch ms). Never throws. Callers skip it when nothing is pending, so a
 * signed-out visitor's navigation is not delayed by even a microtask.
 */
export async function settleAuthorizationChange(deadline: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A change that lands while we wait (a second event after the first
    // refresh finished) starts a new refresh; wait for that too, within the
    // same deadline.
    for (let pending = _pendingChange; pending; pending = _pendingChange) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const expired = await Promise.race([
        pending.then(() => false),
        new Promise<true>((resolve) => {
          timer = setTimeout(() => resolve(true), remaining);
        }),
      ]);
      clearTimeout(timer);
      if (expired) return;
      if (_pendingChange === pending) return; // settled but not yet cleared
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
