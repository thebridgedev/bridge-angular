/**
 * TBP-810 (port of bridge-svelte TBP-810 / bridge-react TBP-941) — a paying
 * user's plan-gated features are known before the first render, and flags
 * follow the billing stores afterwards.
 *
 * Regression: a `<bridge-feature-flag upgrade>` ruled on
 * `bridge:billing.entitlement.<key>` read auth-core's entitlements store, which
 * nothing loaded before the page rendered. It is fail-closed, so a Pro
 * workspace saw "Upgrade to use this" until the realtime catch-up filled it,
 * and a mounted flag never re-evaluated when the store moved. Bridge's API is
 * mocked throughout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBridge, type BridgeAuth } from '@nebulr-group/bridge-auth-core';
import { createBridgeFlags, type BridgeFlagsBundle } from '../flags/bootstrap';
import { evaluateFlag, setBridgeFlagsInstance } from '../flags/registry';
import { flagSignal, __resetFlagReactivity } from '../flags/flag-reactivity';
import { loadBeforeFirstRender, FIRST_RENDER_WAIT_MS } from './startup-reads';
import { __resetBillingRefreshForTests, type BillingRefreshAuth } from '../billing/billing-refresh';
import { __resetSnapshotStores, tenantEntitlementsSignal } from './snapshot-stores';

const API = 'http://api.test.local';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const TOKEN = jwt({ sub: 'u-1', tid: 'ws-1', aid: 'app-1', exp: inAnHour() });

/** A flag that is on only for workspaces whose plan includes `pro_reports`. */
const PRO_TILE = {
  key: 'pro_tile',
  state: 'on-with-rule',
  valueType: 'boolean',
  offValue: false,
  onValue: true,
  rule: {
    branches: [
      {
        conditions: [{ attribute: 'bridge:billing.entitlement.pro_reports', operator: 'eq', values: [true] }],
        returnValue: true,
      },
    ],
    otherwiseValue: false,
    rolloutPct: 100,
  },
};

interface FakeApi {
  entitlements: () => Promise<Response> | Response;
  calls: string[];
  authHeaders: string[];
}

let api: FakeApi;

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function installApi(): void {
  api = {
    entitlements: () => json({ entitlements: { pro_reports: true } }),
    calls: [],
    authHeaders: [],
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    api.calls.push(url.pathname);
    const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
    if (auth) api.authHeaders.push(auth);
    if (url.pathname.startsWith('/admin/flags-internal/flags-cache/')) return json([PRO_TILE]);
    if (url.pathname === '/entitlements') return api.entitlements();
    if (url.pathname === '/billing/state') return json({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' });
    return json({}, 404);
  }));
}

class StubAuth implements BillingRefreshAuth {
  token: string | null = TOKEN;
  refreshTokens = vi.fn(async () => {
    this.token = TOKEN;
    return { accessToken: TOKEN };
  });
  getBridgeAuth(): BridgeAuth {
    return {
      getApiContext: () => ({ apiBaseUrl: API, appId: 'app-1', accessToken: this.token }),
      refreshTokens: this.refreshTokens,
      tokenStaleHandler: () => async () => {
        this.token = jwt({ sub: 'u-1', tid: 'ws-1', aid: 'app-1', exp: inAnHour(), fresh: true });
        return this.token;
      },
    } as unknown as BridgeAuth;
  }
  async loadSubscription(): Promise<void> {}
  async ensureSubscription(): Promise<void> {}
  subscriptionWanted(): boolean {
    return false;
  }
}

let auth: StubAuth;
let bundle: BridgeFlagsBundle | undefined;

beforeEach(() => {
  installApi();
  __resetBillingRefreshForTests();
  __resetSnapshotStores();
  __resetFlagReactivity();
  useBridge().entitlementsStore.__resetForTests();
  auth = new StubAuth();
  bundle = undefined;
});

afterEach(async () => {
  await bundle?.stop();
  setBridgeFlagsInstance(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function flags(): BridgeFlagsBundle {
  bundle = createBridgeFlags({ apiBaseUrl: API, apiKey: 'app-1', telemetry: { enabled: false } as never });
  return bundle;
}

describe('before the first render (TBP-810)', () => {
  it('a Pro workspace’s plan-gated flag is already on when the startup reads settle', async () => {
    const b = flags();
    expect(evaluateFlag('pro_tile', false).passed).toBe(false); // nothing loaded yet

    await loadBeforeFirstRender(auth, b.definitionsLoaded);

    expect(evaluateFlag('pro_tile', false).passed).toBe(true);
    expect(useBridge().entitlementsStore.can('pro_reports')).toBe(true);
    expect(tenantEntitlementsSignal()).toEqual({ pro_reports: true });
    expect(api.calls).toContain('/billing/state');
  });

  it('a slow read holds the first render for 1.5 s at most', async () => {
    vi.useFakeTimers();
    api.entitlements = () => new Promise<Response>(() => {}); // never answers
    let settled = false;
    void loadBeforeFirstRender(auth).then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(FIRST_RENDER_WAIT_MS - 100);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
  });

  it('signed out: no plan reads, only the flag definitions are awaited', async () => {
    auth.token = null;
    const b = flags();
    await loadBeforeFirstRender(auth, b.definitionsLoaded);
    expect(api.calls).not.toContain('/entitlements');
    expect(api.calls).not.toContain('/billing/state');
  });

  it('a stored token that has expired is renewed before the reads', async () => {
    auth.token = jwt({ sub: 'u-1', tid: 'ws-1', aid: 'app-1', exp: Math.floor(Date.now() / 1000) - 60 });
    await loadBeforeFirstRender(auth);
    expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(api.authHeaders.every((h) => h === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('an out-of-date sign-in (401) is renewed once and the read retried (TBP-762)', async () => {
    let first = true;
    api.entitlements = () => {
      if (first) {
        first = false;
        return json({ code: 'TOKEN_VERSION_STALE' }, 401);
      }
      return json({ entitlements: { pro_reports: true } });
    };
    await loadBeforeFirstRender(auth);
    expect(api.calls.filter((p) => p === '/entitlements')).toHaveLength(2);
    expect(useBridge().entitlementsStore.can('pro_reports')).toBe(true);
  });

  it('a read that lands after a workspace switch is dropped', async () => {
    let answer!: (r: Response) => void;
    api.entitlements = () => new Promise<Response>((r) => (answer = r));
    const done = loadBeforeFirstRender(auth);
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    auth.token = jwt({ sub: 'u-1', tid: 'ws-2', aid: 'app-1', exp: inAnHour() });
    answer(json({ entitlements: { pro_reports: true } }));
    await done;
    expect(useBridge().entitlementsStore.can('pro_reports')).toBe(false);
  });
});

describe('flags follow the billing stores (TBP-810)', () => {
  it('a mounted flag unlocks when the plan’s features arrive, with no flag push', async () => {
    const b = flags();
    await b.definitionsLoaded;
    const tile = flagSignal('pro_tile', false);
    expect(tile().passed).toBe(false);

    useBridge().entitlementsStore.applyEntitlementsChanged({ pro_reports: true });
    await Promise.resolve();

    expect(tile().passed).toBe(true);
  });

  it('a downgrade locks it again', async () => {
    const b = flags();
    await b.definitionsLoaded;
    useBridge().entitlementsStore.applyEntitlementsChanged({ pro_reports: true });
    await Promise.resolve();
    const tile = flagSignal('pro_tile', false);
    expect(tile().passed).toBe(true);

    useBridge().entitlementsStore.applyEntitlementsChanged({ pro_reports: false });
    await Promise.resolve();

    expect(tile().passed).toBe(false);
  });

  it('a burst of store changes costs one re-evaluation', async () => {
    const b = flags();
    await b.definitionsLoaded;
    const { subscribeToFlagChanges } = await import('../flags/registry');
    const seen: string[] = [];
    const off = subscribeToFlagChanges((key) => {
      if (key === '*') seen.push(key);
    });
    await Promise.resolve();
    seen.length = 0;

    useBridge().entitlementsStore.applyEntitlementsChanged({ pro_reports: true });
    useBridge().subscription.hydrate({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' } as never);
    useBridge().entitlementsStore.applyEntitlementsChanged({ pro_reports: true, exports: true });
    await Promise.resolve();

    expect(seen).toEqual(['*']);
    off();
  });

  it('stop() unsubscribes from the stores', async () => {
    const b = flags();
    await b.definitionsLoaded;
    const tile = flagSignal('pro_tile', false);
    expect(tile().passed).toBe(false);
    await b.stop();
    bundle = undefined;

    useBridge().entitlementsStore.applyEntitlementsChanged({ pro_reports: true });
    await Promise.resolve();

    // Nothing re-evaluated the cached signal.
    expect(tile().passed).toBe(false);
  });
});
