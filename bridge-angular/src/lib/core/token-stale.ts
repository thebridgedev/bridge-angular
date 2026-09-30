/**
 * TBP-762 — the handler that renews an out-of-date sign-in for a billing or
 * quota read.
 *
 * Right after a checkout Bridge marks the sign-in out of date. A billing read in
 * that window answers `401 TOKEN_VERSION_STALE`; without this handler the read
 * failed and `<bridge-subscription-status>` / `<bridge-billing-notice>` showed
 * "Subscription unavailable" until a reload. With it, auth-core mints a fresh
 * token and retries the read once.
 *
 * `undefined` when the BridgeAuth instance has no `tokenStaleHandler` (a test
 * stand-in): the read then behaves exactly as it did before.
 */
export function tokenStaleHandlerOf(auth: unknown): (() => Promise<string | null>) | undefined {
  const a = auth as { tokenStaleHandler?: () => () => Promise<string | null> } | null | undefined;
  return typeof a?.tokenStaleHandler === 'function' ? a.tokenStaleHandler() : undefined;
}
