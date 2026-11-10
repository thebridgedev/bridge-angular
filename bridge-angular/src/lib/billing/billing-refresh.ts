/**
 * TBP-762 — the billing refresh rule. Angular port of bridge-svelte's
 * `core/billing-store.ts`.
 *
 * The plan list and current plan (`AuthService.subscription`, what
 * `<bridge-plan-selector>` and `<bridge-paywall>` read), the canonical billing
 * state (`useBridge().subscription`, what `<bridge-subscription-status>` and
 * `<bridge-billing-notice>` read) and the plan's features are re-read together,
 * on one rule:
 *
 *   - when the sign-in is renewed (a new access token: refresh, sign-in, a plan
 *     change that re-minted it);
 *   - on a live billing event (plan change, subscription or payment lifecycle);
 *   - when the tab regains focus and the last read is older than 30 seconds;
 *   - one retry when a read fails.
 *
 * Screens call `ensureSubscription()` / `ensureBillingState()` on mount and read
 * the stores; they do not fetch on their own. Only what some screen has asked
 * for is re-read, so an app that never shows billing makes no extra calls.
 *
 * Before this, Angular read each of these once, when a screen mounted: a plan
 * created, changed or removed in Bridge did not show until a reload.
 */
import {
  fetchBillingState,
  useBridge,
  type BridgeAuth,
  type MountOptions,
} from '@nebulr-group/bridge-auth-core';
import { applyEntitlementsChanged } from '../core/snapshot-stores';
import { tokenStaleHandlerOf } from '../core/token-stale';
import { logger } from '../shared/logger';

/** A read older than this is re-read when the tab regains focus. */
export const BILLING_STALE_AFTER_MS = 30_000;

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

/**
 * What the refresh rule needs from the app: the BridgeAuth instance, and the
 * plan list + current plan loader. `AuthService` satisfies it.
 */
export interface BillingRefreshAuth {
  getBridgeAuth(): BridgeAuth;
  loadSubscription(): Promise<void>;
  ensureSubscription(maxAgeMs?: number): Promise<void>;
  subscriptionWanted(): boolean;
}

// ── The one retry ────────────────────────────────────────────────────────────

let _retryDelayMs = 1000;

/** How long a failed billing read waits before its one retry. */
export function billingRetryDelay(): number {
  return _retryDelayMs;
}

/** Test-only. */
export function __setBillingRetryDelayForTests(ms: number): void {
  _retryDelayMs = ms;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function workspaceOf(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { tid?: unknown };
    return typeof json.tid === 'string' ? json.tid : null;
  } catch {
    return null;
  }
}

function currentToken(auth: BillingRefreshAuth): string | null {
  try {
    return auth.getBridgeAuth().getApiContext().accessToken ?? null;
  } catch {
    return null;
  }
}

/** True when the session now belongs to a different workspace (or none) than `token`. */
function workspaceMovedOn(auth: BillingRefreshAuth, token: string): boolean {
  const now = currentToken(auth);
  if (!now) return true;
  return workspaceOf(now) !== workspaceOf(token);
}

/**
 * HTTP options for a billing read: the current token, and the handler that
 * renews an out-of-date one. Null when signed out or before bootstrap.
 */
function billingReadOptions(auth: BillingRefreshAuth): MountOptions | null {
  try {
    const bridge: BridgeAuth = auth.getBridgeAuth();
    const ctx = bridge.getApiContext();
    if (!ctx?.accessToken) return null;
    return {
      apiBaseUrl: ctx.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      accessToken: ctx.accessToken,
      appId: ctx.appId,
      onTokenStale: tokenStaleHandlerOf(bridge),
    };
  } catch {
    return null; // not bootstrapped yet
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Canonical billing state (`useBridge().subscription`) ─────────────────────

let _stateInflight: Promise<void> | null = null;
let _stateAgain = false;
let _stateLoadedAt = 0;
let _stateWanted = false;

/** Re-read the canonical billing state. Concurrent calls share one read. Never rejects. */
export function refreshBillingState(auth: BillingRefreshAuth): Promise<void> {
  _stateWanted = true;
  if (_stateInflight) {
    _stateAgain = true;
    return _stateInflight;
  }
  _stateInflight = (async () => {
    try {
      do {
        _stateAgain = false;
        await readStateOnce(auth);
      } while (_stateAgain);
    } finally {
      _stateInflight = null;
    }
  })();
  return _stateInflight;
}

/** Read the canonical billing state unless a read younger than `maxAgeMs` exists. */
export function ensureBillingState(
  auth: BillingRefreshAuth,
  maxAgeMs = BILLING_STALE_AFTER_MS,
): Promise<void> {
  _stateWanted = true;
  if (_stateInflight) return _stateInflight;
  const sub = useBridge().subscription;
  if (_stateLoadedAt > 0 && sub.snapshot().state && Date.now() - _stateLoadedAt < maxAgeMs) {
    return Promise.resolve();
  }
  return refreshBillingState(auth);
}

async function readStateOnce(auth: BillingRefreshAuth): Promise<void> {
  const sub = useBridge().subscription;
  const hadState = sub.snapshot().state !== null;
  // Only a first read shows "Loading…"; a re-read keeps the plan on screen.
  if (!hadState) {
    sub.setError(null);
    sub.setLoading(true);
  }
  try {
    for (let attempt = 0; ; attempt++) {
      const opts = billingReadOptions(auth);
      if (!opts) {
        if (!sub.snapshot().state) sub.setError('Not authenticated');
        return;
      }
      try {
        const state = await fetchBillingState(opts, logger);
        // Signed out or switched workspace meanwhile: not this session's plan.
        if (workspaceMovedOn(auth, opts.accessToken)) return;
        sub.hydrate(state);
        _stateLoadedAt = Date.now();
        return;
      } catch (err) {
        if (attempt === 0) {
          // The one retry. "Loading…" stays up meanwhile — a checkout that is
          // still being confirmed is not an error.
          await wait(_retryDelayMs);
          continue;
        }
        const message = err instanceof Error ? err.message : 'Failed to load billing state';
        logger.warn('[bridge-billing] billing state read failed:', message);
        if (!sub.snapshot().state) sub.setError(message);
        return;
      }
    }
  } finally {
    if (!hadState) sub.setLoading(false);
  }
}

function stateInStore(): boolean {
  try {
    return useBridge().subscription.snapshot().state !== null;
  } catch {
    return false;
  }
}

// ── The plan's features (`GET /entitlements`) ────────────────────────────────

let _entInflight: Promise<void> | null = null;
let _entAgain = false;

/**
 * TBP-810 — read the workspace's plan features and write them to both copies:
 * auth-core's store (what flag rules on `bridge:billing.entitlement.*` read)
 * and `bridge.tenant.entitlements`.
 *
 * Not `entitlementsStore.refresh()`: that marks the store unloaded while it
 * fetches, and every flag evaluated in that window reads "not entitled". This
 * keeps the current map until the new one arrives. Concurrent calls share one
 * read; a call during a read queues one more. Never rejects.
 */
export function refreshEntitlements(auth: BillingRefreshAuth): Promise<void> {
  if (_entInflight) {
    _entAgain = true;
    return _entInflight;
  }
  _entInflight = (async () => {
    try {
      do {
        _entAgain = false;
        await readEntitlementsOnce(auth);
      } while (_entAgain);
    } finally {
      _entInflight = null;
    }
  })();
  return _entInflight;
}

async function readEntitlementsOnce(auth: BillingRefreshAuth): Promise<void> {
  const opts = billingReadOptions(auth);
  if (!opts || typeof globalThis.fetch !== 'function') return;
  const url = `${opts.apiBaseUrl.replace(/\/+$/, '')}/entitlements`;
  let token = opts.accessToken;
  try {
    const get = (bearer: string) =>
      globalThis.fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}`, 'x-app-id': opts.appId ?? '' },
      });
    let res = await get(token);
    if (res.status === 401 && opts.onTokenStale) {
      // TBP-762 — right after a checkout Bridge marks the sign-in out of date;
      // renew it once and retry, as the billing and quota reads do.
      const fresh = await opts.onTokenStale();
      if (!fresh) return;
      token = fresh;
      res = await get(token);
    }
    if (!res.ok) return;
    const body = (await res.json()) as { entitlements?: unknown } | null;
    const map = body?.entitlements;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    // Signed out, or switched workspace, while this was in flight.
    if (workspaceMovedOn(auth, token)) return;
    try {
      useBridge().entitlementsStore.applyEntitlementsChanged(map as Record<string, boolean>);
    } catch {
      /* auth-core store unavailable — the tenant signal below still moves */
    }
    applyEntitlementsChanged({ entitlements: map });
  } catch (err) {
    // Best-effort: the next session change, push or reconnect repairs it.
    logger.debug('[bridge-billing] entitlements read skipped:', err);
  }
}

// ── All of it, on one rule ───────────────────────────────────────────────────

/**
 * Re-read everything some screen has asked for — the plan list + current plan,
 * the canonical billing state — and the plan's features. What a live billing
 * event and a renewed sign-in call. Never rejects.
 */
export async function refreshBilling(auth: BillingRefreshAuth): Promise<void> {
  try {
    const reads: Promise<void>[] = [];
    if (auth.subscriptionWanted()) reads.push(auth.loadSubscription());
    if (_stateWanted || stateInStore()) reads.push(refreshBillingState(auth));
    reads.push(refreshEntitlements(auth));
    await Promise.all(reads);
  } catch (err) {
    logger.debug('[bridge-billing] refresh skipped:', err);
  }
}

/** Live events after which the billing stores are re-read. */
export const BILLING_REFRESH_EVENTS: ReadonlySet<string> = new Set([
  'subscription.plan_changed',
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'subscription.reactivated',
  'subscription.trial_started',
  'subscription.trial_converted',
  'subscription.trial_expired',
  'payment.succeeded',
  'payment.failed',
  'dunning.recovered',
  'dunning.exhausted',
]);

/** The runtime calls this for every realtime billing event. */
export function billingEventReceived(kind: string, auth: BillingRefreshAuth): void {
  if (!BILLING_REFRESH_EVENTS.has(kind)) return;
  void refreshBilling(auth);
}

// ── The sign-in renewal and tab-focus triggers ──────────────────────────────

let _stop: (() => void) | null = null;

/**
 * Install the sign-in-renewal and tab-focus triggers. `onTokens` subscribes to
 * access-token changes (`BridgeRuntimeService.onTokens`). Browser only; returns
 * the stop function. A second call replaces the first.
 */
export function startBillingRefresh(
  auth: BillingRefreshAuth,
  onTokens: (handler: (accessToken: string | undefined) => void) => () => void,
): () => void {
  _stop?.();
  let lastToken: string | null = currentToken(auth);
  const offToken = onTokens((accessToken) => {
    const token = accessToken ?? null;
    if (token === lastToken) return;
    lastToken = token;
    if (token) void refreshBilling(auth);
  });

  const onFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!currentToken(auth)) return;
    const reads: Promise<void>[] = [];
    if (auth.subscriptionWanted()) reads.push(auth.ensureSubscription(BILLING_STALE_AFTER_MS));
    if (_stateWanted || stateInStore()) reads.push(ensureBillingState(auth, BILLING_STALE_AFTER_MS));
    void Promise.all(reads).catch(() => {});
  };
  const win =
    typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  const doc =
    typeof document !== 'undefined' && typeof document.addEventListener === 'function'
      ? document
      : null;
  win?.addEventListener('focus', onFocus);
  doc?.addEventListener('visibilitychange', onFocus);

  const stop = () => {
    offToken();
    win?.removeEventListener('focus', onFocus);
    doc?.removeEventListener('visibilitychange', onFocus);
    if (_stop === stop) _stop = null;
  };
  _stop = stop;
  return stop;
}

/** Test-only. */
export function __resetBillingRefreshForTests(): void {
  _stop?.();
  _stop = null;
  _stateInflight = null;
  _stateAgain = false;
  _stateLoadedAt = 0;
  _stateWanted = false;
  _entInflight = null;
  _entAgain = false;
  _retryDelayMs = 1000;
}
