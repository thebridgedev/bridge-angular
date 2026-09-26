/**
 * TBP-660 — a live plan change can be lost while the socket is replaced.
 *
 * On `user.state_changed` the SDK refreshes the token, the new token makes the
 * runtime `reauthorize()` (close + reopen), and AppSync has no replay: a
 * `subscription.plan_changed` published during the swap is gone. That
 * reconnect is flagged self-induced and skipped every catch-up, so the store
 * stayed on the old plan (1 in 8 stage runs, bridge-svelte, 2026-09-15).
 *
 * After ANY reconnect the runtime now re-reads billing state once — without
 * touching the token, so the self-refresh loop guard still holds.
 *
 * TBP-686 — and on the FIRST connect too: the pushed session.snapshot loses
 * the race on a first connect (published during authorize, before the
 * subscription is live), so the runtime reads `GET /session/init`. It also
 * re-reads every quota metric already hydrated, since auth-core's QuotaStore
 * never re-reads one and a lost `quota.updated` froze `used` for the session.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBridge, type WebSocketLike } from '@nebulr-group/bridge-auth-core';
import {
  BridgeRuntimeService,
  type BridgeAuthorizationChangeReason,
} from './bridge-runtime.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import {
  __resetSnapshotStores,
  applySessionSnapshot,
  appBrandingSignal,
  tenantEntitlementsSignal,
  tenantIdSignal,
  tenantNameSignal,
  tenantSubscriptionSignal,
  userSnapshotSignal,
} from './snapshot-stores';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string, public protocols?: string | string[]) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code });
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const API = 'http://api.test.local';
const realtimeFetch = (async (url: string) => {
  const ok = new URL(url).pathname === '/realtime/config';
  const body = ok ? { kind: 'appsync', endpoint: 'svc.appsync-realtime-api.eu-west-1.amazonaws.com' } : {};
  return { ok, status: ok ? 200 : 404, json: async () => body };
}) as unknown as typeof fetch;

/** What the server says NOW — the catch-up reads this. */
let server: { plan: { slug: string; name: string }; status: string; entitlements: Record<string, boolean> };
let catchUpCalls: string[];
let catchUpHeaders: Record<string, Record<string, string>>;
/** Quota answers by metric (TBP-686). A metric missing here answers 404. */
let quotaServer: Record<string, unknown>;
/** When set, a request waits for this before answering — to race it. */
let hold: ((path: string) => Promise<void>) | null;
const catchUpFetch = (async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  catchUpCalls.push(path);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  catchUpHeaders[path] = headers;
  // Read what the server says NOW, before any hold, so a held answer is stale.
  const snapshotNow = sessionSnapshot();
  const quotaNow = quotaServer;
  if (hold) await hold(path);
  if (!headers['Authorization']?.startsWith('Bearer ')) return { ok: false, status: 401, json: async () => ({}) };
  if (path === '/session/init') {
    return { ok: true, status: 200, json: async () => snapshotNow };
  }
  if (path.startsWith('/usage/quota/')) {
    const metric = decodeURIComponent(path.slice('/usage/quota/'.length));
    if (!(metric in quotaNow)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => quotaNow[metric] };
  }
  if (path === '/billing/state') {
    return { ok: true, status: 200, json: async () => ({ plan: server.plan, status: server.status }) };
  }
  if (path === '/entitlements') {
    return { ok: true, status: 200, json: async () => ({ entitlements: server.entitlements }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
}) as unknown as typeof fetch;

/** `GET /session/init` for the current `server` state. */
function sessionSnapshot() {
  return {
    app: { branding: { logo: '', name: 'Acme' } },
    tenant: {
      id: 'ws-1',
      name: 'Acme',
      subscription: { plan: server.plan, status: server.status },
      entitlements: server.entitlements,
    },
    user: { id: 'user-1', role: 'OWNER', tenantId: 'ws-1' },
  };
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let seq = 0;
function token(): string {
  seq += 1;
  const claims = { aid: 'app-1', tid: 'ws-1', sub: 'user-1', iat: seq, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `${b64url(JSON.stringify({ alg: 'PS256' }))}.${b64url(JSON.stringify(claims))}.sig`;
}

function connectOk(ws: FakeWebSocket): void {
  ws.readyState = 1;
  ws.onopen?.({});
  ws.message({ type: 'connection_ack' });
  for (const raw of ws.sent) {
    const f = JSON.parse(raw);
    if (f.type === 'subscribe') ws.message({ type: 'subscribe_success', id: f.id });
  }
}

const settle = async (ms = 20) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, ms / 3));
};
const lastWs = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

class StubAuthService {
  readonly tokens = signal<{ accessToken: string } | null>(null);
  refreshCalls = 0;
  /** When set, a refresh mints this token (and publishes it, as auth-core does). */
  mint: (() => string) | null = null;
  getBridgeAuth() {
    return {
      refreshTokens: async () => {
        this.refreshCalls += 1;
        if (!this.mint) return null;
        const accessToken = this.mint();
        this.tokens.set({ accessToken });
        return { accessToken };
      },
      getPlans: async () => [],
      invalidateFeatureFlagCache: () => {},
    };
  }
  async maybeRefreshNow(): Promise<boolean> {
    return !!(await this.getBridgeAuth().refreshTokens());
  }
}

let auth: StubAuthService;
let runtime: BridgeRuntimeService;
let reauthCalls = 0;
let reasons: BridgeAuthorizationChangeReason[];

function setTokens(t: string | null): void {
  auth.tokens.set(t ? { accessToken: t } : null);
  TestBed.flushEffects();
}

async function start(): Promise<void> {
  runtime.start({
    fetch: catchUpFetch,
    realtime: {
      websocketFactory: (u, p) => new FakeWebSocket(u, p),
      fetchFn: realtimeFetch,
      reportStatus: false,
      diagnose: false,
      reconnectBaseMs: 5,
    },
  });
  const rt = runtime.getRealtime()!;
  const original = rt.reauthorize.bind(rt);
  rt.reauthorize = async () => {
    reauthCalls += 1;
    return original();
  };
  TestBed.flushEffects();
  await settle();
}

const realError = console.error;

beforeEach(() => {
  console.error = () => {};
  FakeWebSocket.instances = [];
  reauthCalls = 0;
  catchUpCalls = [];
  catchUpHeaders = {};
  quotaServer = {};
  hold = null;
  reasons = [];
  server = { plan: { slug: 'free', name: 'Free' }, status: 'active', entitlements: { pro_page: false } };
  __resetSnapshotStores();
  applySessionSnapshot({
    app: { branding: { logo: '', name: 'Acme' } },
    tenant: {
      id: 'ws-1',
      name: 'Acme',
      subscription: { plan: { slug: 'free', name: 'Free' }, status: 'active' },
      entitlements: { pro_page: false },
    },
    user: { id: 'user-1', role: 'OWNER', tenantId: 'ws-1' },
  });
  const billing = useBridge();
  billing.quotas.__resetForTests();
  billing.subscription.hydrate({ plan: { slug: 'free', name: 'Free' }, status: 'active' } as never);
  // No live pushes needed here — the catch-up is the path under test.
  vi.spyOn(billing, 'attachToRealtimeClient').mockImplementation((() => {}) as never);

  auth = new StubAuthService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'app-1', apiBaseUrl: API }) } },
    ],
  });
  runtime = TestBed.inject(BridgeRuntimeService);
  runtime.onAuthorizationChange((r) => reasons.push(r));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await runtime.stop();
  console.error = realError;
});

describe('a reconnect caused by reauthorize() catches up (TBP-660)', () => {
  it('the plan change published during the swap reaches the stores — one catch-up, one refresh, no loop', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();
    // TBP-686 — the first connect catches up too; the server matches the
    // stores here, so it changes nothing. This test is about the swap below.
    expect(catchUpCalls.sort()).toEqual(['/billing/state', '/entitlements', '/session/init']);
    expect(reasons).toEqual([]);
    catchUpCalls = [];

    // user.state_changed → token refresh → reauthorize(); the plan change is
    // published while the old socket is closing, and never arrives.
    setTokens(token());
    server = { plan: { slug: 'pro', name: 'Pro' }, status: 'active', entitlements: { pro_page: true } };
    await settle();
    connectOk(lastWs());
    await settle();

    expect(catchUpCalls.sort()).toEqual(['/billing/state', '/entitlements', '/session/init']);
    expect(tenantSubscriptionSignal()?.plan).toEqual({ slug: 'pro', name: 'Pro' });
    expect(tenantEntitlementsSignal()).toEqual({ pro_page: true });
    expect(useBridge().subscription.snapshot().state?.plan.slug).toBe('pro');
    expect(useBridge().entitlements.can('pro_page')).toBe(true);
    // The route guard hears it once.
    expect(reasons.filter((r) => r === 'reconnect')).toEqual(['reconnect']);
    // TBP-654 — the recovered plan change starts ONE token refresh, so the
    // token carrying the new plan is fetched now rather than on the next
    // user.state_changed. This stub mints nothing, so no second reauthorize.
    expect(auth.refreshCalls).toBe(1);
    expect(reauthCalls).toBe(1);
  });

  it('the refresh a recovered plan change starts does not loop through the reconnect it causes (TBP-654)', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();

    setTokens(token());
    server = { plan: { slug: 'pro', name: 'Pro' }, status: 'active', entitlements: { pro_page: true } };
    auth.mint = token; // the refresh returns a new token from here on
    await settle();
    connectOk(lastWs()); // catch-up finds Pro → refresh → new token → reauthorize
    await settle();
    connectOk(lastWs()); // catch-up again: nothing moved → no refresh
    await settle();
    connectOk(lastWs());
    await settle();

    expect(auth.refreshCalls).toBe(1);
    expect(reauthCalls).toBe(2);
    expect(reasons.filter((r) => r === 'reconnect')).toEqual(['reconnect']);
  });

  it('nothing missed → three GETs per open and no authorization change', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    setTokens(token());
    await settle();
    connectOk(lastWs());
    await settle();

    // Three for the first connect (TBP-686), three for the reconnect.
    expect(catchUpCalls).toHaveLength(6);
    expect(reasons).toEqual(['token']);
    expect(tenantSubscriptionSignal()?.plan.slug).toBe('free');
  });
});

describe('a genuine reconnect is unchanged, plus the catch-up (TBP-660)', () => {
  it('network drop → the existing token refresh once, and one catch-up', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();

    server = { plan: { slug: 'pro', name: 'Pro' }, status: 'active', entitlements: { pro_page: true } };
    lastWs().close(1006);
    await settle(40);
    connectOk(lastWs());
    await settle();

    // The reconnect's own refresh, plus the one the recovered plan change
    // starts (TBP-654). auth-core's refreshTokens() shares one in-flight
    // request between overlapping calls, so on the wire this is one refresh.
    expect(auth.refreshCalls).toBe(2);
    // Three for the first connect (TBP-686), three for the reconnect.
    expect(catchUpCalls).toHaveLength(6);
    expect(tenantSubscriptionSignal()?.plan.slug).toBe('pro');
  });

  it('a signed-out session has no workspace state to catch up on', async () => {
    await start();
    connectOk(lastWs());
    lastWs().close(1006);
    await settle(40);
    connectOk(lastWs());
    await settle();
    expect(catchUpCalls).toEqual([]);
  });
});

describe('the first connect catches up on the snapshot the push lost (TBP-686)', () => {
  it('fetches /session/init and fills tenant id, name, branding and user', async () => {
    __resetSnapshotStores(); // the pushed snapshot never arrived
    const t = token();
    auth.tokens.set({ accessToken: t });
    await start();
    connectOk(lastWs());
    await settle();

    expect(catchUpCalls).toContain('/session/init');
    expect(catchUpHeaders['/session/init']['Authorization']).toBe(`Bearer ${t}`);
    expect(catchUpHeaders['/session/init']['x-app-id']).toBe('app-1');
    expect(tenantIdSignal()).toBe('ws-1');
    expect(tenantNameSignal()).toBe('Acme');
    expect(appBrandingSignal()?.name).toBe('Acme');
    expect(userSnapshotSignal()?.id).toBe('user-1');
    expect(tenantSubscriptionSignal()?.plan.slug).toBe('free');
    expect(tenantEntitlementsSignal()).toEqual({ pro_page: false });
    expect(useBridge().entitlements.can('pro_page')).toBe(false);
    // Empty → filled is hydration, not a change: the delivered push would not
    // have re-run the route guard or refreshed the token, so neither does this.
    expect(reasons).toEqual([]);
    expect(auth.refreshCalls).toBe(0);
    expect(reauthCalls).toBe(0);
  });

  it('a store that already held plan A and now reads B is a change — reported as the push would have', async () => {
    // beforeEach delivered "Free"; the upgrade push was then lost.
    server = { plan: { slug: 'pro', name: 'Pro' }, status: 'active', entitlements: { pro_page: true } };
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();

    expect(tenantSubscriptionSignal()?.plan.slug).toBe('pro');
    // Not 'reconnect': this was no reconnect. Plan wins over entitlements.
    expect(reasons).toEqual(['subscription.plan_changed']);
    expect(auth.refreshCalls).toBe(1); // TBP-654 — the token carrying Pro
  });

  it('does not refresh tokens, reauthorize or report a change when nothing moved', async () => {
    auth.tokens.set({ accessToken: token() }); // stores already match the server
    await start();
    connectOk(lastWs());
    await settle();

    expect(catchUpCalls).toContain('/session/init');
    expect(auth.refreshCalls).toBe(0);
    expect(reauthCalls).toBe(0);
    expect(reasons).toEqual([]);
  });

  it('a signed-out first connect makes no requests', async () => {
    __resetSnapshotStores();
    await start();
    connectOk(lastWs());
    await settle();
    expect(catchUpCalls).toEqual([]);
    expect(tenantIdSignal()).toBeNull();
  });

  it('an open storm ends with the answer fetched for the newest socket', async () => {
    __resetSnapshotStores();
    auth.tokens.set({ accessToken: token() });
    await start();
    let releaseFirst!: () => void;
    const first = new Promise<void>((r) => (releaseFirst = r));
    hold = (path) => (path === '/session/init' ? first : Promise.resolve());
    connectOk(lastWs()); // first connect: its snapshot read is held with "Free"
    await settle();
    hold = null;
    server = { plan: { slug: 'pro', name: 'Pro' }, status: 'active', entitlements: { pro_page: true } };
    lastWs().close(1006);
    await settle(40);
    connectOk(lastWs()); // the newer open reads "Pro"
    await settle();
    releaseFirst(); // the stale answer lands last
    await settle();

    expect(tenantSubscriptionSignal()?.plan.slug).toBe('pro');
    expect(tenantEntitlementsSignal()).toEqual({ pro_page: true });
  });

  it('stop() while a catch-up is in flight → its answer is dropped', async () => {
    __resetSnapshotStores();
    auth.tokens.set({ accessToken: token() });
    await start();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    hold = () => gate;
    connectOk(lastWs());
    await settle();
    await runtime.stop();
    release();
    await settle();
    expect(tenantIdSignal()).toBeNull();
    expect(reasons).toEqual([]);
  });
});

describe('every open re-reads the quota metrics already hydrated (TBP-686)', () => {
  const snap = (used: number) =>
    ({ metric: 'ai_completions', used, limit: 100, remaining: 100 - used, warningLevel: null });

  it('re-reads only hydrated metrics and applies the answers to the store', async () => {
    const quotas = useBridge().quotas;
    quotas.applyInitialSnapshot('ai_completions', snap(10));
    quotaServer = { ai_completions: snap(42), never_read: snap(5) };
    const t = token();
    auth.tokens.set({ accessToken: t });
    await start();
    connectOk(lastWs());
    await settle();

    const quotaCalls = catchUpCalls.filter((p) => p.startsWith('/usage/quota/'));
    expect(quotaCalls).toEqual(['/usage/quota/ai_completions']);
    expect(catchUpHeaders['/usage/quota/ai_completions']['Authorization']).toBe(`Bearer ${t}`);
    expect(catchUpHeaders['/usage/quota/ai_completions']['x-app-id']).toBe('app-1');
    expect(quotas.get('ai_completions')?.used).toBe(42);
    expect(quotas.get('never_read')).toBeUndefined();
  });

  it('a push that lands while the GET is in flight wins', async () => {
    const quotas = useBridge().quotas;
    quotas.applyInitialSnapshot('ai_completions', snap(10));
    quotaServer = { ai_completions: snap(42) };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    hold = (path) => (path.startsWith('/usage/quota/') ? gate : Promise.resolve());
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();

    quotas.applyQuotaUpdated({ ...snap(77), kind: 'quota.updated' } as never); // newer than the GET
    release();
    await settle();
    expect(quotas.get('ai_completions')?.used).toBe(77);
  });

  it('a failed quota read keeps the cached value', async () => {
    const quotas = useBridge().quotas;
    quotas.applyInitialSnapshot('ai_completions', snap(10));
    quotaServer = {}; // 404
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();
    expect(catchUpCalls).toContain('/usage/quota/ai_completions');
    expect(quotas.get('ai_completions')?.used).toBe(10);
  });

  it('no metric hydrated → no quota request at all', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();
    expect(catchUpCalls).toContain('/session/init');
    expect(catchUpCalls.some((p) => p.startsWith('/usage/quota/'))).toBe(false);
  });
});
