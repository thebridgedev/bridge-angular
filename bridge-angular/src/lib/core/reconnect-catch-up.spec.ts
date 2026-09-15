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
  tenantEntitlementsSignal,
  tenantSubscriptionSignal,
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
const catchUpFetch = (async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  catchUpCalls.push(path);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  if (!headers['Authorization']?.startsWith('Bearer ')) return { ok: false, status: 401, json: async () => ({}) };
  if (path === '/billing/state') {
    return { ok: true, status: 200, json: async () => ({ plan: server.plan, status: server.status }) };
  }
  if (path === '/entitlements') {
    return { ok: true, status: 200, json: async () => ({ entitlements: server.entitlements }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
}) as unknown as typeof fetch;

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
  getBridgeAuth() {
    return {
      refreshTokens: async () => {
        this.refreshCalls += 1;
        return null;
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
  it('the plan change published during the swap reaches the stores — one catch-up, no refresh, no loop', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    await settle();
    expect(catchUpCalls).toEqual([]); // first connect: nothing to catch up on

    // user.state_changed → token refresh → reauthorize(); the plan change is
    // published while the old socket is closing, and never arrives.
    setTokens(token());
    server = { plan: { slug: 'pro', name: 'Pro' }, status: 'active', entitlements: { pro_page: true } };
    await settle();
    connectOk(lastWs());
    await settle();

    expect(catchUpCalls.sort()).toEqual(['/billing/state', '/entitlements']);
    expect(tenantSubscriptionSignal()?.plan).toEqual({ slug: 'pro', name: 'Pro' });
    expect(tenantEntitlementsSignal()).toEqual({ pro_page: true });
    expect(useBridge().subscription.snapshot().state?.plan.slug).toBe('pro');
    expect(useBridge().entitlements.can('pro_page')).toBe(true);
    // The route guard hears it once.
    expect(reasons.filter((r) => r === 'reconnect')).toEqual(['reconnect']);
    // Loop guard intact: no token refresh, no second reauthorize.
    expect(auth.refreshCalls).toBe(0);
    expect(reauthCalls).toBe(1);
  });

  it('nothing missed → two GETs and no authorization change', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    setTokens(token());
    await settle();
    connectOk(lastWs());
    await settle();

    expect(catchUpCalls).toHaveLength(2);
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

    expect(auth.refreshCalls).toBe(1);
    expect(catchUpCalls).toHaveLength(2);
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
