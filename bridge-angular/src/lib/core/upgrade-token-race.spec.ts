/**
 * Regression (TBP-654, upgrade race) — found on bridge-svelte by the M33
 * clean-room smoke on stage, 2 of 6 runs; bridge-angular had the same shape:
 *
 *   +484 ms  subscription.plan_changed → the page shows "Pro"
 *   +489 ms  the user clicks into the plan-gated /pro
 *            → the route guard evaluates the plan-targeted rule with the OLD
 *              (Free) access token → refused, bounced to the redirect route
 *   +774 ms  the token refresh (started only by user.state_changed) lands
 *
 * Real `BridgeRuntimeService` + real `bridgeAuthGuard`. Only the edges are
 * faked: auth-core's BridgeAuth (refresh), its realtime client (so the test
 * can deliver the pushes) and the flag evaluation, which answers from the plan
 * claim of the token the runtime last handed the flag context — exactly how
 * `BridgeBootstrapService` wires `runtime.onTokens → applyAuthContext`.
 * Angular effects are NOT flushed: in an app they run later than the refresh
 * promise, which is part of the race. Timers are fake so the bound is exact.
 */
import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient, useBridge } from '@nebulr-group/bridge-auth-core';
import { BridgeRuntimeService } from './bridge-runtime.service';
import { BridgeService } from './bridge.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { __resetSnapshotStores } from './snapshot-stores';
import { AUTHORIZATION_CHANGE_WAIT_MS } from './pending-authorization-change';
import { __resetBridgeRouteGuardState, bridgeAuthGuard, type RouteGuardConfig } from '../guards/route-guard';

const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (claims: Record<string, unknown>) => `${enc({ alg: 'PS256' })}.${enc(claims)}.sig`;
const base = { sub: 'user-1', tid: 'ws-1', aid: 'app-1', exp: Math.floor(Date.now() / 1000) + 3600 };
const FREE = jwt({ ...base, plan: 'free', tv: 1 });
// Minted after the plan was saved but BEFORE the server bumped tokenVersion.
const PRO_PRE_BUMP = jwt({ ...base, plan: 'pro', tv: 1 });
const PRO = jwt({ ...base, plan: 'pro', tv: 2 });
const planOf = (t: string | undefined) =>
  t ? JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).plan : null;

const PLAN_CHANGED = {
  kind: 'subscription.plan_changed',
  tenantId: 'ws-1',
  from: { slug: 'free' },
  to: { slug: 'pro', name: 'Pro' },
  status: 'active',
  effectiveAt: '2026-09-15T10:00:00.000Z',
};
const ENTITLEMENTS_CHANGED = {
  kind: 'entitlements.changed',
  tenantId: 'ws-1',
  entitlements: { pro_page: true },
  effectiveAt: '2026-09-15T10:00:00.000Z',
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/auth/login', public: true },
    { match: '/upgrade' },
    { match: '/pro', featureFlag: 'pro-page', redirectTo: '/upgrade' },
  ],
  defaultAccess: 'protected',
};

class StubAuthService {
  readonly tokens = signal<{ accessToken: string } | null>(null);
  readonly isAuthenticated = computed(() => !!this.tokens()?.accessToken);
  refreshCalls = 0;
  refreshImpl: () => Promise<unknown> = () => Promise.resolve(null);
  createLoginUrl() {
    return 'https://hosted.example/login';
  }
  getBridgeAuth() {
    return {
      refreshTokens: () => {
        this.refreshCalls += 1;
        return this.refreshImpl();
      },
      invalidateFeatureFlagCache: () => {},
      getPlans: async () => [],
      shouldRedirectToPaywall: async () => false,
    };
  }
  async maybeRefreshNow(): Promise<boolean> {
    return false;
  }
}

/** `/pro` is gated on `pro-page` = `tenant.plan in [pro]`, read from the token the flag context holds. */
class StubBridge {
  contextToken: string | undefined;
  evaluatedWith: Array<string | undefined> = [];
  evaluate(key: string) {
    this.evaluatedWith.push(this.contextToken);
    return { passed: key === 'pro-page' && planOf(this.contextToken) === 'pro' };
  }
}

let auth: StubAuthService;
let flags: StubBridge;
let runtime: BridgeRuntimeService;
let billing: Record<string, (msg: unknown) => void>;
let userStateHook: (msg: Record<string, unknown>) => Promise<void>;

/** The server mints `token`; it lands `ms` after the refresh starts. */
function refreshLandsAfter(ms: number, token: string = PRO): () => Promise<unknown> {
  return () =>
    new Promise((resolve) => {
      setTimeout(() => {
        auth.tokens.set({ accessToken: token });
        resolve({ accessToken: token });
      }, ms);
    });
}

/** Settle-tracking wrapper: lets a test assert a decision has NOT been made yet. */
function track<T>(p: Promise<T>): { done: boolean; value?: T } {
  const state: { done: boolean; value?: T } = { done: false };
  void p.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

function navigate(url: string): Promise<unknown> {
  return TestBed.runInInjectionContext(
    () => bridgeAuthGuard()({} as never, { url } as never) as Promise<unknown>,
  );
}

function startSignedIn(token: string | null, fetchImpl?: typeof fetch): void {
  auth.tokens.set(token ? { accessToken: token } : null);
  flags.contextToken = token ?? undefined; // bootstrap applies the current token on initFlags
  runtime = TestBed.inject(BridgeRuntimeService);
  runtime.onTokens((t) => {
    flags.contextToken = t;
  });
  runtime.start({ fetch: fetchImpl });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  __resetSnapshotStores();
  __resetBridgeRouteGuardState();
  sessionStorage.clear();
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
  vi.spyOn(RealtimeClient.prototype, 'start').mockResolvedValue(undefined as never);
  vi.spyOn(RealtimeClient.prototype, 'stop').mockResolvedValue(undefined as never);
  vi.spyOn(RealtimeClient.prototype, 'reauthorize').mockResolvedValue(undefined as never);

  auth = new StubAuthService();
  auth.refreshImpl = refreshLandsAfter(300);
  flags = new StubBridge();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: BridgeService, useValue: flags },
      {
        provide: BridgeConfigService,
        useValue: {
          getConfig: () => ({ appId: 'app-1', apiBaseUrl: 'http://api.test', loginRoute: '/auth/login' }),
          getRouteGuardConfig: () => routeConfig,
        },
      },
      { provide: Router, useValue: { url: '/', parseUrl: (u: string) => ({ __parsed: u }) } },
    ],
  });
});

afterEach(async () => {
  await runtime?.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a plan change makes route decisions wait for the refreshed token (TBP-654)', () => {
  it('plan_changed, then an immediate navigation → the guard waits for the refresh and allows with the new token', async () => {
    startSignedIn(FREE);
    billing['subscription.plan_changed'](PLAN_CHANGED); // the page now says Pro
    const decision = track(navigate('/pro'));

    await vi.advanceTimersByTimeAsync(299);
    expect(decision.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(decision.done).toBe(true);
    expect(decision.value).toBe(true);
    expect(flags.evaluatedWith).toEqual([PRO]);
    expect(auth.refreshCalls).toBe(1);
  });

  it('the refresh starts on plan_changed itself — it does not wait for user.state_changed', () => {
    startSignedIn(FREE);
    billing['subscription.plan_changed'](PLAN_CHANGED);
    expect(auth.refreshCalls).toBe(1);
  });

  it('entitlements.changed starts it too', async () => {
    startSignedIn(FREE);
    billing['entitlements.changed'](ENTITLEMENTS_CHANGED);
    expect(auth.refreshCalls).toBe(1);
    const decision = track(navigate('/pro'));
    await vi.advanceTimersByTimeAsync(300);
    expect(decision.value).toBe(true);
  });

  it('a plan change recovered by the post-reconnect catch-up (TBP-660) starts it too', async () => {
    const fetchImpl = (async (url: string) =>
      String(url).includes('/billing/state')
        ? { ok: true, json: async () => ({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' }) }
        : { ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    startSignedIn(FREE, fetchImpl);
    await (runtime as unknown as { catchUpAfterReconnect(): Promise<void> }).catchUpAfterReconnect();
    expect(auth.refreshCalls).toBe(1);
    const decision = track(navigate('/pro'));
    await vi.advanceTimersByTimeAsync(300);
    expect(decision.value).toBe(true);
  });

  it(`a refresh slower than the ${AUTHORIZATION_CHANGE_WAIT_MS} ms bound → decided at the bound with the token it has: fail closed`, async () => {
    startSignedIn(FREE);
    auth.refreshImpl = refreshLandsAfter(5_000);
    billing['subscription.plan_changed'](PLAN_CHANGED);
    const decision = track(navigate('/pro'));

    await vi.advanceTimersByTimeAsync(AUTHORIZATION_CHANGE_WAIT_MS - 1);
    expect(decision.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ __parsed: '/upgrade' });
    expect(flags.evaluatedWith).toEqual([FREE]);
  });

  it('a refresh that fails does not hang the guard or let the route through', async () => {
    startSignedIn(FREE);
    auth.refreshImpl = () => Promise.reject(new Error('refresh failed'));
    billing['subscription.plan_changed'](PLAN_CHANGED);
    const decision = track(navigate('/pro'));
    await vi.advanceTimersByTimeAsync(0);
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ __parsed: '/upgrade' });
  });

  it('plan_changed + entitlements.changed + user.state_changed in quick succession → ONE refresh, no loop', async () => {
    startSignedIn(FREE);
    billing['subscription.plan_changed'](PLAN_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    billing['entitlements.changed'](ENTITLEMENTS_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    const userState = userStateHook({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    expect(auth.refreshCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    await userState;
    // The new token re-runs only the 'token' invalidation, which never refreshes —
    // also once Angular's tokens effect catches up with the same value.
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(AUTHORIZATION_CHANGE_WAIT_MS);
    expect(auth.refreshCalls).toBe(1);
    expect(runtime.getCurrentAuthToken()).toBe(PRO);
  });

  it('a navigation with no change pending decides at once — no wait, no refresh', async () => {
    startSignedIn(FREE);
    const decision = track(navigate('/upgrade'));
    await Promise.resolve();
    await Promise.resolve();
    expect(decision.done).toBe(true);
    expect(decision.value).toBe(true);
    expect(auth.refreshCalls).toBe(0);
  });
});

// The early refresh can be minted after the plan is saved but before the
// server bumps tokenVersion (it bumps after publishing plan_changed). That
// token carries the new plan but is TOKEN_VERSION_STALE on every
// version-checked endpoint.
describe('a joined refresh that predates the announced token version is followed up once (TBP-654)', () => {
  function preBumpThenCurrent(): void {
    let n = 0;
    auth.refreshImpl = () => refreshLandsAfter(300, n++ === 0 ? PRO_PRE_BUMP : PRO)();
  }

  it('user.state_changed announces tv 2 while the joined refresh mints tv 1 → one follow-up refresh to tv 2', async () => {
    startSignedIn(FREE);
    preBumpThenCurrent();
    billing['subscription.plan_changed'](PLAN_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    const userState = userStateHook({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    expect(auth.refreshCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(300); // the pre-bump token lands
    expect(auth.refreshCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(300);
    await userState;
    expect(runtime.getCurrentAuthToken()).toBe(PRO);
    expect(auth.refreshCalls).toBe(2);
  });

  it('a navigation during the follow-up waits for it too, within the same bound', async () => {
    startSignedIn(FREE);
    preBumpThenCurrent();
    billing['subscription.plan_changed'](PLAN_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    void userStateHook({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    // t=340: the pre-bump token landed at 300 and the follow-up (lands at 600) is in flight.
    await vi.advanceTimersByTimeAsync(300);
    expect(auth.refreshCalls).toBe(2);
    const decision = track(navigate('/pro'));
    await vi.advanceTimersByTimeAsync(259);
    expect(decision.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(decision.value).toBe(true);
    expect(flags.evaluatedWith).toEqual([PRO]);
  });

  it('no version on the message (older server) → the single refresh stands', async () => {
    startSignedIn(FREE);
    preBumpThenCurrent();
    billing['subscription.plan_changed'](PLAN_CHANGED);
    const userState = userStateHook({ kind: 'user.state_changed', reason: 'plan_changed' });
    await vi.advanceTimersByTimeAsync(300);
    await userState;
    expect(auth.refreshCalls).toBe(1);
    expect(runtime.getCurrentAuthToken()).toBe(PRO_PRE_BUMP);
  });
});

describe('signed-out visitors are unaffected (TBP-654)', () => {
  it('no token → the events start no refresh and a protected route goes straight to login (TBP-629 return-to kept)', async () => {
    startSignedIn(null);
    billing['subscription.plan_changed'](PLAN_CHANGED);
    await userStateHook({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 5 });
    expect(auth.refreshCalls).toBe(0);
    const decision = track(navigate('/pro'));
    await Promise.resolve();
    await Promise.resolve();
    expect(decision.done).toBe(true);
    expect(decision.value).toEqual({ __parsed: '/auth/login?redirectUri=%2Fpro' });
  });
});
