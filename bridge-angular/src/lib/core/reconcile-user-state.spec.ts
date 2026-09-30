/**
 * TBP-700 — a user-state change published during a (re)connect is never lost.
 *
 * Regression on bridge-svelte's stage runs (2026-09-27): a role change did not
 * reach a signed-in user live, 4 of 4 runs. The server bumps the user's token
 * version and publishes `user.state_changed`; AppSync has no replay, so a
 * publish that lands while the socket is being replaced is gone. The reconnect
 * our own reauthorize() causes skipped the token refresh (the TBP-644 loop
 * guard), and the catch-up only re-read the plan and entitlements — so nothing
 * recovered it and the user kept the old role until a reload.
 *
 * Every connect now ends with ONE `refreshTokens({ fresh: true })`, run once
 * every channel is live (auth-core's `setOnSubscribed`). A token that carries
 * the same authority keeps the socket; one that differs is the missed change,
 * and is handled like the push would have been.
 *
 * Driven through the REAL auth-core RealtimeClient with a fake WebSocket. The
 * server is a token-version counter; a refresh mints a token carrying it.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocketLike } from '@nebulr-group/bridge-auth-core';
import {
  BridgeRuntimeService,
  type BridgeAuthorizationChangeReason,
} from './bridge-runtime.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';

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
// The state catch-up is not under test here; every GET fails (and is ignored).
const catchUpFetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let iat = 0;
function tokenAt(tv: number, extra: Record<string, unknown> = {}): string {
  iat += 1;
  const claims = {
    aid: 'app-1',
    tid: 'ws-1',
    sub: 'user-1',
    role: tv > 1 ? 'OWNER' : 'ADMIN',
    tv,
    iat,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${b64url(JSON.stringify({ alg: 'PS256' }))}.${b64url(JSON.stringify(claims))}.sig`;
}
function tvOf(token: string | undefined): number | undefined {
  if (!token) return undefined;
  return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).tv;
}

/** Subscribe frames the socket sent so far. */
function subscribeIds(ws: FakeWebSocket): string[] {
  return ws.sent.map((raw) => JSON.parse(raw)).filter((f) => f.type === 'subscribe').map((f) => f.id);
}
function handshake(ws: FakeWebSocket): void {
  ws.readyState = 1;
  ws.onopen?.({});
  ws.message({ type: 'connection_ack' });
}
function connectOk(ws: FakeWebSocket): void {
  handshake(ws);
  for (const id of subscribeIds(ws)) ws.message({ type: 'subscribe_success', id });
}

const settle = async (ms = 20) => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, ms / 3));
};
const lastWs = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

class StubAuthService {
  readonly tokens = signal<{ accessToken: string } | null>(null);
  /** The server's current token version: a refresh mints a token carrying it. */
  serverTv = 1;
  refreshCalls = 0;
  freshCalls = 0;
  mint: () => string = () => tokenAt(this.serverTv);
  getBridgeAuth() {
    return {
      refreshTokens: async (options?: { fresh?: boolean }) => {
        this.refreshCalls += 1;
        if (options?.fresh) this.freshCalls += 1;
        const accessToken = this.mint();
        this.tokens.set({ accessToken }); // auth-core publishes the new token
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
  reasons = [];
  iat = 0;
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
  await runtime.stop();
  console.error = realError;
});

describe('a user-state change published during a (re)connect is never lost (TBP-700)', () => {
  it('a role change published while our own reauthorize() replaces the socket is recovered', async () => {
    auth.tokens.set({ accessToken: tokenAt(1) });
    await start();
    connectOk(lastWs());
    await settle();

    // A token rotation — expiry refresh, sign-in, anything — reauthorizes…
    setTokens(tokenAt(1));
    // …and the role change is published while the old socket is closing:
    // AppSync drops it, nothing replays it.
    auth.serverTv = 2;
    await settle();
    connectOk(lastWs()); // the replacement socket
    await settle();

    expect(tvOf(runtime.getCurrentAuthToken())).toBe(2);
    expect(reasons).toContain('token'); // the route guard re-checks with the new role
  });

  it('the recovered change re-authorizes once, and the reconnect it causes finds nothing new', async () => {
    auth.tokens.set({ accessToken: tokenAt(1) });
    await start();
    connectOk(lastWs());
    await settle();
    setTokens(tokenAt(1)); // swap
    auth.serverTv = 2; // lost
    await settle();
    const reauthsBefore = reauthCalls;

    connectOk(lastWs());
    await settle();
    expect(reauthCalls).toBe(reauthsBefore + 1); // the new role gets its socket

    connectOk(lastWs());
    await settle();
    expect(reauthCalls).toBe(reauthsBefore + 1); // …and that is the end of it
  });

  it('every connect reconciles with a FRESH refresh — the first one included', async () => {
    auth.tokens.set({ accessToken: tokenAt(1) });
    await start();
    connectOk(lastWs());
    await settle();

    expect(auth.refreshCalls).toBe(1);
    expect(auth.freshCalls).toBe(1);
    // Same authority (only iat moved): the socket that was just subscribed stays.
    expect(reauthCalls).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(reasons).toEqual([]);
  });

  it('the reconcile waits for every channel, not the first subscribe ack', async () => {
    auth.tokens.set({ accessToken: tokenAt(1) });
    await start();
    const ws = lastWs();
    handshake(ws);
    const ids = subscribeIds(ws);
    expect(ids.length).toBeGreaterThan(1); // app, workspace and user channels

    ws.message({ type: 'subscribe_success', id: ids[0] }); // 'open' fires here
    await settle();
    expect(runtime.getRealtime()!.getState()).toBe('open');
    expect(auth.refreshCalls).toBe(0);

    for (const id of ids.slice(1)) ws.message({ type: 'subscribe_success', id });
    await settle();
    expect(auth.refreshCalls).toBe(1);
  });

  it('a claim that differs on every mint cannot turn into a reconnect loop', async () => {
    let nonce = 0;
    auth.mint = () => tokenAt(1, { nonce: ++nonce });
    auth.tokens.set({ accessToken: tokenAt(1, { nonce: 0 }) });
    await start();
    for (let i = 0; i < 10; i++) {
      connectOk(lastWs());
      await settle();
    }
    expect(reauthCalls).toBe(3); // then it stops swapping
  });

  it('a signed-out session has no user state to reconcile', async () => {
    await start();
    connectOk(lastWs());
    await settle();
    expect(auth.refreshCalls).toBe(0);
  });
});
