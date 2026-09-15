/**
 * TBP-654 — anything that can change a route verdict without a flag changing
 * reaches the route guard layer, once per event, before the app hears it.
 *
 * Regression (bridge-svelte, stage 2026-09-15): a Free user upgraded to Pro and
 * the plan-gated route stayed locked, because only a realtime FLAG change
 * invalidated the route-guard cache. In bridge-angular the guard evaluates FF
 * 2.0 rules live, but the same four triggers were invisible to everything that
 * caches or only re-evaluates on a signal: the reactive flag signals, auth-core's
 * legacy FeatureFlagService cache, and the page the user is already on.
 *
 * Also TBP-653 — a sign-out never reached the token subscribers, so the flag
 * eval context kept the signed-out user's claims.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient, useBridge, type WebSocketLike } from '@nebulr-group/bridge-auth-core';
import {
  BridgeRuntimeService,
  type BridgeAuthorizationChangeReason,
} from './bridge-runtime.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { bridgeEvents } from './events';
import { __resetSnapshotStores } from './snapshot-stores';
import { subscribeToFlagChanges } from '../flags/registry';

const API = 'http://api.test.local';

class InertWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  send(): void {}
  close(): void {}
}

const fetchFn = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let seq = 0;
function token(plan = 'free'): string {
  seq += 1;
  const claims = { aid: 'app-1', tid: 'ws-1', sub: 'user-1', plan, iat: seq, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `${b64url(JSON.stringify({ alg: 'PS256' }))}.${b64url(JSON.stringify(claims))}.sig`;
}

const planChanged = {
  kind: 'subscription.plan_changed',
  tenantId: 'ws-1',
  from: { slug: 'free' },
  to: { slug: 'pro', name: 'Pro' },
  status: 'active',
  effectiveAt: '2026-09-15T09:00:00.000Z',
};
const entitlementsChanged = {
  kind: 'entitlements.changed',
  tenantId: 'ws-1',
  entitlements: { pro_page: true },
  effectiveAt: '2026-09-15T09:00:00.000Z',
};

/** Ordered record of what happened, across the runtime, the app and auth-core. */
let log: string[];

class StubAuthService {
  readonly tokens = signal<{ accessToken: string } | null>(null);
  invalidations = 0;
  getBridgeAuth() {
    return {
      refreshTokens: async () => null,
      getPlans: async () => [],
      invalidateFeatureFlagCache: () => {
        this.invalidations += 1;
        log.push('invalidate');
      },
    };
  }
  async maybeRefreshNow(): Promise<boolean> {
    log.push('refresh');
    return false;
  }
}

let auth: StubAuthService;
let runtime: BridgeRuntimeService;
let billing: Record<string, (msg: unknown) => void>;
let userStateHook: (msg: { kind: string; reason: string }) => Promise<void> | void;
let reasons: BridgeAuthorizationChangeReason[];
const offs: Array<() => void> = [];

function setTokens(t: string | null): void {
  auth.tokens.set(t ? { accessToken: t } : null);
  TestBed.flushEffects();
}

beforeEach(() => {
  __resetSnapshotStores();
  log = [];
  reasons = [];
  const billingBridge = useBridge();
  vi.spyOn(billingBridge, 'handle').mockImplementation(((h: Record<string, (msg: unknown) => void>) => {
    billing = h;
    return () => {};
  }) as never);
  vi.spyOn(billingBridge, 'attachToRealtimeClient').mockImplementation((() => {}) as never);
  vi.spyOn(RealtimeClient.prototype, 'setOnUserState').mockImplementation(function (
    this: RealtimeClient,
    hook: typeof userStateHook,
  ) {
    userStateHook = hook;
  } as never);

  auth = new StubAuthService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'app-1', apiBaseUrl: API }) } },
    ],
  });
  runtime = TestBed.inject(BridgeRuntimeService);
  offs.push(
    runtime.onAuthorizationChange((r) => {
      reasons.push(r);
      log.push(`authz:${r}`);
    }),
  );
  offs.push(
    bridgeEvents.handle({
      'subscription.plan_changed': () => log.push('dispatch:plan'),
      'entitlements.changed': () => log.push('dispatch:entitlements'),
      'quota.updated': () => log.push('dispatch:quota'),
    }),
  );
  runtime.start({
    realtime: { websocketFactory: () => new InertWebSocket(), fetchFn, reportStatus: false, diagnose: false },
  });
  TestBed.flushEffects();
});

afterEach(async () => {
  for (const off of offs.splice(0)) off();
  vi.restoreAllMocks();
  await runtime.stop();
});

describe('each trigger invalidates once, before the app hears the event (TBP-654)', () => {
  it('subscription.plan_changed', () => {
    billing['subscription.plan_changed'](planChanged);
    expect(reasons).toEqual(['subscription.plan_changed']);
    expect(auth.invalidations).toBe(1);
    expect(log).toEqual(['invalidate', 'authz:subscription.plan_changed', 'dispatch:plan']);
  });

  it('entitlements.changed', () => {
    billing['entitlements.changed'](entitlementsChanged);
    expect(reasons).toEqual(['entitlements.changed']);
    expect(auth.invalidations).toBe(1);
    expect(log).toEqual(['invalidate', 'authz:entitlements.changed', 'dispatch:entitlements']);
  });

  it('user.state_changed — signed out, so no token refresh (TBP-654)', async () => {
    await userStateHook({ kind: 'user.state_changed', reason: 'plan_changed' });
    expect(reasons).toEqual(['user.state_changed']);
    expect(auth.invalidations).toBe(1);
    expect(log).toEqual(['invalidate', 'authz:user.state_changed']);
  });

  it('every access-token change — sign-in, refresh, sign-out — once each', () => {
    // The session present at start() is not a change.
    expect(reasons).toEqual([]);
    setTokens(token('free'));
    setTokens(token('pro'));
    setTokens(null);
    expect(reasons).toEqual(['token', 'token', 'token']);
    expect(auth.invalidations).toBe(3);
  });

  it('an unchanged token value is not a change', () => {
    const t = token();
    setTokens(t);
    setTokens(t);
    expect(reasons).toEqual(['token']);
  });

  it('pushes that cannot change a verdict do not invalidate', () => {
    billing['quota.updated']({ kind: 'quota.updated', metric: 'ai', used: 1, limit: 10 });
    expect(reasons).toEqual([]);
    expect(auth.invalidations).toBe(0);
    expect(log).toEqual(['dispatch:quota']);
  });
});

describe('reactive flag reads re-evaluate when a rule input changes (TBP-654)', () => {
  it('a plan change tells every flag signal to recompute', () => {
    const seen: string[] = [];
    offs.push(subscribeToFlagChanges((key) => seen.push(String(key))));
    billing['subscription.plan_changed'](planChanged);
    expect(seen).toContain('*');
  });

  it('an entitlements change tells every flag signal to recompute', () => {
    const seen: string[] = [];
    offs.push(subscribeToFlagChanges((key) => seen.push(String(key))));
    billing['entitlements.changed'](entitlementsChanged);
    expect(seen).toContain('*');
  });
});

describe('sign-out reaches the token subscribers (TBP-653)', () => {
  it('the flag eval context is told the session ended', () => {
    const seen: Array<string | undefined> = [];
    offs.push(runtime.onTokens((t) => seen.push(t)));
    const t = token();
    setTokens(t);
    setTokens(null);
    expect(seen).toEqual([t, undefined]);
  });
});
