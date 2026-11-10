/**
 * TBP-810 — the reads a signed-in page needs before its plan-gated features can
 * be drawn, and re-reading them when the session changes. Angular port of
 * bridge-svelte's `loadEntitlementsBeforeFirstRender` (`BridgeBootstrap.ts`)
 * and bridge-react's `core/startup-reads.ts` (TBP-941).
 *
 * What went wrong (bridge-angular 0.9.0): a `<bridge-feature-flag upgrade>`
 * whose rule is a plan feature (`bridge:billing.entitlement.<key> eq true`)
 * reads auth-core's entitlements store, and nothing configured or loaded it
 * before the page rendered. It is fail-closed, so a paying workspace evaluated
 * as "entitled to nothing" and showed "Upgrade to use this" until the realtime
 * catch-up filled it about a second later. The flag definitions were fetched
 * without waiting too, so every flag rendered its fallback first.
 *
 * Now `provideBridge()`'s app initializer waits for the plan's features, the
 * billing state and the flag definitions — all at once, each capped at 1.5 s —
 * before Angular renders the first page. They are read again on every new
 * access token (sign-in, workspace switch, a token that carries a different
 * plan, a renewal) and on every live billing event, by the billing refresh
 * rule (`billing/billing-refresh.ts`).
 */
import { useBridge } from '@nebulr-group/bridge-auth-core';
import {
  refreshBillingState,
  refreshEntitlements,
  type BillingRefreshAuth,
} from '../billing/billing-refresh';
import { logger } from '../shared/logger';

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

/** Longest the first render waits for one startup read before showing anyway. */
export const FIRST_RENDER_WAIT_MS = 1500;

/** A stored token this close to expiry is renewed before the startup reads. */
const EXPIRY_SKEW_MS = 30_000;

/** Wait for `work`, but never longer than `ms`. Never rejects. */
export async function withinWait(
  work: Promise<unknown>,
  ms: number = FIRST_RENDER_WAIT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([work.catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function currentToken(auth: BillingRefreshAuth): string | null {
  try {
    return auth.getBridgeAuth().getApiContext().accessToken ?? null;
  } catch {
    return null;
  }
}

function expiryOf(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const exp = (JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Wire auth-core's entitlements store to this app, so it can load itself and
 * recover on its own instead of answering "no" for every key forever. The
 * token is read lazily, so a renewal needs no reconfigure. Idempotent.
 */
export function configureEntitlementsStore(auth: BillingRefreshAuth): void {
  try {
    const bridge = auth.getBridgeAuth();
    useBridge().entitlementsStore.configure(
      {
        apiBaseUrl: bridge.getApiContext().apiBaseUrl ?? DEFAULT_API_BASE_URL,
        getAccessToken: () => currentToken(auth),
      },
      logger,
    );
  } catch (err) {
    logger.debug('[bridge-startup] entitlements store not configured:', err);
  }
}

/**
 * The startup reads, for a page that loads signed in: the plan's features, the
 * billing state and the flag definitions, all at once, each capped at
 * {@link FIRST_RENDER_WAIT_MS}. A stored token that has expired (a visit after
 * a long break) is renewed first, so the reads do not fail on it. Signed out,
 * only the flag definitions are awaited. Never rejects.
 */
export async function loadBeforeFirstRender(
  auth: BillingRefreshAuth,
  definitions?: Promise<unknown>,
): Promise<void> {
  configureEntitlementsStore(auth);
  const reads: Promise<unknown>[] = [];
  if (definitions) reads.push(withinWait(definitions));

  let token = currentToken(auth);
  if (token) {
    const exp = expiryOf(token);
    if (exp !== null && exp * 1000 <= Date.now() + EXPIRY_SKEW_MS) {
      try {
        await withinWait(auth.getBridgeAuth().refreshTokens());
      } catch {
        // Not initialised — nothing to renew with.
      }
      token = currentToken(auth);
    }
  }
  if (token) {
    reads.push(withinWait(refreshEntitlements(auth)), withinWait(refreshBillingState(auth)));
  }
  await Promise.all(reads);
}
