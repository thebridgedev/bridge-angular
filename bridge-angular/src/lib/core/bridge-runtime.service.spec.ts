/**
 * TBP-644 — the bridge runtime ↔ realtime client contract, driven through the
 * REAL auth-core RealtimeClient with a fake WebSocket + fetch.
 *
 * 1. The runtime reauthorized only on token ROTATION (A → B). A session that
 *    signed in after bootstrap (none → A) kept the anonymous connection, and a
 *    client parked after a refusal stayed parked until something else
 *    reconnected it. It must reauthorize on every change of the token value.
 * 2. That must not reopen the self-induced refresh loop the on-open refresh
 *    guard exists for.
 * 3. `refreshAuthToken` is wired, and a refresh it triggers is not followed by
 *    a second one on the reconnect.
 * 4. The full RealtimeStatus reaches the public API; 'degraded' is wired.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RealtimeStatus, WebSocketLike } from '@nebulr-group/bridge-auth-core';
import { BridgeRuntimeService } from './bridge-runtime.service';
import { BridgeService } from './bridge.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { _setRealtimeStatusDetail, realtimeStatus, realtimeStatusDetail } from './realtime-status';

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
const APPSYNC_HOST = 'svc.appsync-realtime-api.eu-west-1.amazonaws.com';

const fetchFn = (async (url: string) => {
  const path = new URL(url).pathname;
  const ok = path === '/realtime/config';
  const body = ok ? { kind: 'appsync', endpoint: APPSYNC_HOST } : {};
  return { ok, status: ok ? 200 : 404, json: async () => body };
}) as unknown as typeof fetch;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let tokenSeq = 0;
function token(sub = 'user-1'): string {
  tokenSeq += 1;
  const claims = {
    iss: `${API}/auth`,
    aid: 'app-1',
    tid: 't-1',
    sub,
    iat: tokenSeq,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${b64url(JSON.stringify({ alg: 'PS256' }))}.${b64url(JSON.stringify(claims))}.sig`;
}

function presented(ws: FakeWebSocket): string {
  const list = Array.isArray(ws.protocols) ? ws.protocols : [ws.protocols ?? ''];
  const header = list.find((p) => p.startsWith('header-'))!.slice('header-'.length);
  const padded = header.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((header.length + 3) % 4);
  return JSON.parse(atob(padded)).Authorization;
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

function refuse(ws: FakeWebSocket): void {
  ws.readyState = 1;
  ws.onopen?.({});
  ws.message({ type: 'connection_error', errors: [{ errorType: 'UnauthorizedException', errorCode: 401 }] });
}

const settle = async (ms = 20) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, ms / 3));
};
const lastWs = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

class StubAuthService {
  readonly tokens = signal<{ accessToken: string } | null>(null);
  refreshCalls = 0;
  refreshImpl: () => Promise<{ accessToken: string } | null> = async () => null;
  getBridgeAuth() {
    return {
      refreshTokens: async () => {
        this.refreshCalls += 1;
        return this.refreshImpl();
      },
      getPlans: async () => [],
    };
  }
  async maybeRefreshNow(): Promise<boolean> {
    return !!(await this.getBridgeAuth().refreshTokens());
  }
}

let auth: StubAuthService;
let runtime: BridgeRuntimeService;
let reauthCalls = 0;

function setTokens(t: string | null): void {
  auth.tokens.set(t ? { accessToken: t } : null);
  TestBed.flushEffects();
}

async function start(): Promise<void> {
  runtime.start({
    realtime: {
      websocketFactory: (u, p) => new FakeWebSocket(u, p),
      fetchFn,
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
  console.error = () => {}; // auth-core logs the (expected) refusals at error level
  FakeWebSocket.instances = [];
  reauthCalls = 0;
  _setRealtimeStatusDetail({ state: 'idle', retrying: false, since: 0 });
  auth = new StubAuthService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'app-1', apiBaseUrl: API }) } },
    ],
  });
  runtime = TestBed.inject(BridgeRuntimeService);
});

afterEach(async () => {
  await runtime.stop();
  console.error = realError;
});

describe('reauthorizes on every token value change (TBP-644)', () => {
  it('first sign-in (no token → token) reconnects with the user token', async () => {
    await start();
    connectOk(lastWs());
    expect(presented(lastWs())).toBe('anonymous');

    const t = token();
    setTokens(t);
    expect(reauthCalls).toBe(1);
    await settle();
    expect(presented(lastWs())).toBe(`Bearer ${t}`);
  });

  it('a signed-out session parked after a refusal resumes as soon as the user signs in', async () => {
    await start();
    refuse(lastWs());
    await settle();
    expect(runtime.getRealtime()!.getState()).toBe('unauthorized');
    const before = FakeWebSocket.instances.length;

    const t = token();
    setTokens(t);
    await settle();
    // Resumes NOW — not after auth-core's 5 s parked-token poll.
    expect(FakeWebSocket.instances.length).toBe(before + 1);
    expect(presented(lastWs())).toBe(`Bearer ${t}`);
  });

  it('sign-out (token → no token) reconnects as the signed-out session', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    setTokens(null);
    expect(reauthCalls).toBe(1);
    await settle();
    expect(presented(lastWs())).toBe('anonymous');
  });

  it('the session already present at start is not a change — start() connects with it', async () => {
    const t = token();
    auth.tokens.set({ accessToken: t });
    await start();
    expect(reauthCalls).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(presented(lastWs())).toBe(`Bearer ${t}`);
  });
});

// TBP-700 replaced the TBP-644 "self-induced reconnects skip the refresh"
// guard: that skip is exactly how a role change published during our own
// socket swap was lost for good. Every connect now reconciles with ONE
// refresh, and the loop is broken by what the refresh returns instead — a
// token that changes nothing does not replace the socket.
describe('every connect reconciles once without looping (TBP-644, TBP-700)', () => {
  it('the reconnect caused by a sign-in reconciles once and stays on its socket; a genuine one reconciles too', async () => {
    await start();
    connectOk(lastWs()); // anonymous — nothing to reconcile
    await settle();
    expect(auth.refreshCalls).toBe(0);

    const t = token();
    setTokens(t);
    // Each refresh mints the same authority with a new iat, like the server.
    auth.refreshImpl = async () => {
      const next = token();
      setTokens(next);
      return { accessToken: next };
    };
    await settle();
    connectOk(lastWs());
    await settle();
    expect(auth.refreshCalls).toBe(1);
    expect(reauthCalls).toBe(1); // the sign-in's; the reconcile's token replaced nothing

    lastWs().close(1006);
    await settle(40);
    connectOk(lastWs());
    await settle();
    expect(auth.refreshCalls).toBe(2);
    expect(reauthCalls).toBe(1);
  });
});

describe('refreshAuthToken is wired (TBP-644)', () => {
  it('a refused session refreshes once, reconnects with the NEW token, and the open reconciles once and stays', async () => {
    auth.tokens.set({ accessToken: token() });
    await start();
    connectOk(lastWs());
    lastWs().close(1006);
    await settle(40);

    // The first connect's reconcile (TBP-700) already ran; count from here.
    auth.refreshCalls = 0;
    const fresh = token();
    auth.refreshImpl = async () => {
      setTokens(fresh);
      return { accessToken: fresh };
    };
    refuse(lastWs());
    await settle();
    expect(auth.refreshCalls).toBe(1);
    expect(presented(lastWs())).toBe(`Bearer ${fresh}`);

    const sockets = FakeWebSocket.instances.length;
    connectOk(lastWs());
    await settle();
    expect(runtime.getRealtime()!.getState()).toBe('open');
    // TBP-700 — the open reconciles once; it gets the token it already has,
    // so the socket stays and nothing refreshes again.
    expect(auth.refreshCalls).toBe(2);
    expect(FakeWebSocket.instances.length).toBe(sockets);
  });

  it('a signed-out session has nothing to refresh', async () => {
    await start();
    refuse(lastWs());
    await settle();
    expect(auth.refreshCalls).toBe(0);
  });
});

describe('the full realtime status reaches the public API (TBP-644)', () => {
  it("propagates 'unauthorized' with reason, side, docs link and ref to the signals and onStatus", async () => {
    const seen: RealtimeStatus[] = [];
    runtime.onStatus((s) => seen.push(s));

    auth.tokens.set({ accessToken: token() });
    await start();
    refuse(lastWs());
    await settle();

    const detail = realtimeStatusDetail();
    expect(realtimeStatus()).toBe('unauthorized');
    expect(detail.state).toBe('unauthorized');
    expect(typeof detail.reason).toBe('string');
    expect(typeof detail.side).toBe('string');
    expect(detail.retrying).toBe(false);
    expect(detail.docsUrl).toContain(`#${detail.reason}`);
    expect(typeof detail.ref).toBe('string');
    expect(seen[seen.length - 1]).toEqual(detail);
    // …and on the unified service surface.
    expect(TestBed.inject(BridgeService).realtimeStatusDetail()).toEqual(detail);
  });

  it("reports 'degraded' when every channel subscription is rejected", async () => {
    await start();
    const ws = lastWs();
    ws.readyState = 1;
    ws.onopen?.({});
    ws.message({ type: 'connection_ack' });
    for (const raw of ws.sent) {
      const f = JSON.parse(raw);
      if (f.type === 'subscribe') ws.message({ type: 'subscribe_error', id: f.id, errors: [{ errorType: 'X' }] });
    }
    expect(realtimeStatus()).toBe('degraded');
  });
});
