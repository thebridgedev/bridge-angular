/**
 * TBP-762 (port of bridge-svelte `core/billing-store.ts`) — the billing screens
 * stay current.
 *
 * Regression: Angular read the plan list, the current plan and the billing
 * state once, when a screen mounted. A plan created, changed or removed in
 * Bridge did not show until a reload, and an empty plan list said "No plans
 * available." with no way to ask again. Now one rule re-reads them on a renewed
 * sign-in, a live billing event and tab focus after 30 s. Bridge's API is
 * mocked throughout.
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>()),
  fetchBillingState: vi.fn(),
}));

import {
  fetchBillingState,
  useBridge,
  type BridgeAuth,
  type Plan,
  type WebSocketLike,
} from '@nebulr-group/bridge-auth-core';
import {
  BILLING_STALE_AFTER_MS,
  __resetBillingRefreshForTests,
  __setBillingRetryDelayForTests,
  billingEventReceived,
  ensureBillingState,
  startBillingRefresh,
  type BillingRefreshAuth,
} from './billing-refresh';
import { AuthService, type SubscriptionState } from '../shared/services/auth.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { SubscriptionStatusComponent } from '../components/subscription/subscription-status.component';
import { PlanSelectorComponent } from '../components/subscription/plan-selector.component';

const API = 'http://api.test.local';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}
const TOKEN_A = jwt({ sub: 'u-1', tid: 'ws-1', n: 1 });
const TOKEN_B = jwt({ sub: 'u-1', tid: 'ws-1', n: 2 });

const PRO: Plan = { key: 'pro', name: 'Pro', prices: [{ id: 'p', amount: 1000, currency: 'usd', recurrenceInterval: 'month' }] } as Plan;
const TEAM: Plan = { key: 'team', name: 'Team', prices: [{ id: 't', amount: 3000, currency: 'usd', recurrenceInterval: 'month' }] } as Plan;

const state = (slug: string) => ({ plan: { slug, name: slug.toUpperCase() }, status: 'active' }) as never;

/** The BridgeAuth calls the refresh rule makes, mocked. */
function fakeBridgeAuth(over: Partial<Record<string, unknown>> = {}) {
  const ctx = { apiBaseUrl: API, appId: 'app-1', accessToken: TOKEN_A as string | null };
  return {
    ctx,
    getApiContext: () => ctx,
    getSubscriptionStatus: vi.fn(async () => ({ plan: { key: 'pro' } })),
    getPlans: vi.fn(async () => [PRO]),
    ...over,
  };
}

/** An AuthService backed by a fake BridgeAuth — the real loader under test. */
function authWith(bridge: ReturnType<typeof fakeBridgeAuth>): AuthService {
  const auth = new AuthService();
  (auth as unknown as { _instance: unknown })._instance = bridge;
  return auth;
}

let entitlementsCalls = 0;

beforeEach(() => {
  __resetBillingRefreshForTests();
  __setBillingRetryDelayForTests(0);
  useBridge().subscription.hydrate(null as never);
  vi.mocked(fetchBillingState).mockReset().mockResolvedValue(state('pro'));
  entitlementsCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/entitlements')) entitlementsCalls += 1;
    return { ok: true, status: 200, json: async () => ({ entitlements: { reports: true } }) };
  }));
});

afterEach(() => {
  __resetBillingRefreshForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the refresh rule (TBP-762)', () => {
  function startWithTokens(auth: BillingRefreshAuth) {
    let emit!: (t: string | undefined) => void;
    const stop = startBillingRefresh(auth, (h) => {
      emit = h;
      return () => {};
    });
    return { emit, stop };
  }

  it('a renewed sign-in re-reads the plan list, the billing state and the plan’s features', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription(); // a screen asked for the plans
    await ensureBillingState(auth); // a screen showed the badge
    bridge.getPlans.mockClear();
    vi.mocked(fetchBillingState).mockClear();
    const { emit } = startWithTokens(auth);

    bridge.ctx.accessToken = TOKEN_B;
    emit(TOKEN_B);
    await vi.waitFor(() => expect(entitlementsCalls).toBe(1));

    expect(bridge.getPlans).toHaveBeenCalledTimes(1);
    expect(fetchBillingState).toHaveBeenCalledTimes(1);
  });

  it('the same token again, or a sign-out, reads nothing', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    bridge.getPlans.mockClear();
    const { emit } = startWithTokens(auth);

    emit(TOKEN_A);
    emit(undefined);
    await Promise.resolve();

    expect(bridge.getPlans).not.toHaveBeenCalled();
    expect(entitlementsCalls).toBe(0);
  });

  it('a plan added in Bridge shows after the next trigger, with no reload', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    expect(auth.subscription().plans?.map((p) => p.key)).toEqual(['pro']);

    bridge.getPlans.mockResolvedValue([PRO, TEAM]);
    billingEventReceived('subscription.updated', auth);
    await vi.waitFor(() => expect(auth.subscription().plans?.map((p) => p.key)).toEqual(['pro', 'team']));
  });

  it('tab focus re-reads only what is older than 30 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    await ensureBillingState(auth);
    startWithTokens(auth);
    bridge.getPlans.mockClear();
    vi.mocked(fetchBillingState).mockClear();

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(bridge.getPlans).not.toHaveBeenCalled();
    expect(fetchBillingState).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + BILLING_STALE_AFTER_MS + 1000);
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(bridge.getPlans).toHaveBeenCalledTimes(1));
    expect(fetchBillingState).toHaveBeenCalledTimes(1);
  });

  it('focus while signed out reads nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    startWithTokens(auth);
    bridge.getPlans.mockClear();
    bridge.ctx.accessToken = null;
    vi.setSystemTime(Date.now() + BILLING_STALE_AFTER_MS + 1000);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(bridge.getPlans).not.toHaveBeenCalled();
  });

  it('an app that never showed billing reads no plans or billing state', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    const { emit } = startWithTokens(auth);
    bridge.ctx.accessToken = TOKEN_B;
    emit(TOKEN_B);
    await vi.waitFor(() => expect(entitlementsCalls).toBe(1));
    expect(bridge.getPlans).not.toHaveBeenCalled();
    expect(fetchBillingState).not.toHaveBeenCalled();
  });

  it('only events that change billing trigger a read', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    bridge.getPlans.mockClear();
    billingEventReceived('quota.updated', auth);
    billingEventReceived('subscription.trial_ending_soon', auth);
    await Promise.resolve();
    expect(bridge.getPlans).not.toHaveBeenCalled();
  });
});

describe('the runtime sends live billing events through the rule (TBP-762)', () => {
  class InertWebSocket implements WebSocketLike {
    readyState = 0;
    onopen: ((ev: unknown) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    send(): void {}
    close(): void {
      this.readyState = 3;
    }
  }

  it('subscription.created re-reads the plan list the picker shows', async () => {
    let handlers!: Record<string, (msg: unknown) => void>;
    vi.spyOn(useBridge(), 'handle').mockImplementation(((h: Record<string, (msg: unknown) => void>) => {
      handlers = h;
      return () => {};
    }) as never);
    vi.spyOn(useBridge(), 'attachToRealtimeClient').mockImplementation((() => {}) as never);
    const bridge = fakeBridgeAuth({ refreshTokens: async () => null, invalidateFeatureFlagCache: () => {} });
    const auth = authWith(bridge);
    (auth as unknown as { _tokens: ReturnType<typeof signal> })._tokens.set(null);
    await auth.loadSubscription();
    bridge.getPlans.mockClear();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'app-1', apiBaseUrl: API }) } },
      ],
    });
    const rt = TestBed.inject(BridgeRuntimeService);
    rt.start({
      realtime: {
        websocketFactory: () => new InertWebSocket(),
        fetchFn: (async () => ({ ok: true, status: 200, json: async () => ({ kind: 'noop' }) })) as unknown as typeof fetch,
        reportStatus: false,
        diagnose: false,
      },
      fetch: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch,
    });

    handlers['subscription.created']({ kind: 'subscription.created', tenantId: 'ws-1' });
    await vi.waitFor(() => expect(bridge.getPlans).toHaveBeenCalledTimes(1));
    await rt.stop();
    vi.restoreAllMocks();
  });
});

describe('the plan list loader (TBP-762)', () => {
  it('a re-read keeps the plans on screen (no spinner flash)', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    let release!: (p: Plan[]) => void;
    bridge.getPlans.mockImplementation(() => new Promise<Plan[]>((r) => (release = r)));

    const reread = auth.loadSubscription();
    expect(auth.subscription().loading).toBe(false);
    expect(auth.subscription().plans).toEqual([PRO]);
    release([PRO, TEAM]);
    await reread;
    expect(auth.subscription().plans).toEqual([PRO, TEAM]);
  });

  it('an empty list is asked for once more before it is believed', async () => {
    const bridge = fakeBridgeAuth();
    bridge.getPlans.mockResolvedValueOnce([]).mockResolvedValueOnce([PRO]);
    const auth = authWith(bridge);
    await auth.loadSubscription();
    expect(bridge.getPlans).toHaveBeenCalledTimes(2);
    expect(auth.subscription().plans).toEqual([PRO]);
  });

  it('a failed re-read keeps the last good answer; a failed first read shows the error', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.loadSubscription();
    bridge.getPlans.mockRejectedValue(new Error('network down'));
    await auth.loadSubscription();
    expect(auth.subscription()).toMatchObject({ plans: [PRO], error: null, loading: false });

    const fresh = authWith(fakeBridgeAuth({ getPlans: vi.fn(async () => Promise.reject(new Error('network down'))) }));
    await fresh.loadSubscription();
    expect(fresh.subscription()).toMatchObject({ plans: null, error: 'network down', loading: false });
  });

  it('ensureSubscription reads once, then not again within 30 s', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    await auth.ensureSubscription();
    await auth.ensureSubscription();
    expect(bridge.getPlans).toHaveBeenCalledTimes(1);
    expect(auth.subscriptionWanted()).toBe(true);
  });
});

describe('the subscription badge follows the plan (TBP-762)', () => {
  it('a re-read keeps the plan on screen, then shows the new one', async () => {
    const bridge = fakeBridgeAuth();
    const auth = authWith(bridge);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    const fixture = TestBed.createComponent(SubscriptionStatusComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('PRO');
    });

    let release!: (s: never) => void;
    vi.mocked(fetchBillingState).mockImplementation(() => new Promise((r) => (release = r)));
    billingEventReceived('subscription.plan_changed', auth);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('PRO');
    expect(fixture.nativeElement.textContent).not.toContain('Loading');

    release(state('team'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('TEAM');
    });
    fixture.destroy();
  });
});

describe('the plan picker offers a retry (TBP-762)', () => {
  class StubAuth {
    readonly sub = signal<SubscriptionState>({ status: null, plans: [], loading: false, error: null });
    readonly subscription = this.sub.asReadonly();
    loadSubscription = vi.fn(async () => {
      this.sub.set({ status: null, plans: [PRO], loading: false, error: null });
    });
    ensureSubscription = vi.fn(async () => {});
    subscriptionWanted = () => true;
    getBridgeAuth() {
      return {} as BridgeAuth;
    }
  }

  @Component({ standalone: true, imports: [PlanSelectorComponent], template: `<bridge-plan-selector />` })
  class Host {}

  let stub: StubAuth;
  beforeEach(() => {
    stub = new StubAuth();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: AuthService, useValue: stub }] });
  });

  it('on mount it asks the store (read unless fresh), not a read of its own', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(stub.ensureSubscription).toHaveBeenCalledTimes(1);
    expect(stub.loadSubscription).not.toHaveBeenCalled();
  });

  it('an empty list: "could not be loaded" with Try again, which reads again', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain('No plans available.');
    expect(el.querySelector('[data-bridge-plan-empty]')?.textContent).toContain('The plans could not be loaded.');

    (el.querySelector('[data-bridge-plan-retry]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-bridge-plan-card]')).not.toBeNull();
    });
    expect(stub.loadSubscription).toHaveBeenCalledTimes(1);
  });

  it('a failed read: the error with Try again', async () => {
    stub.sub.set({ status: null, plans: null, loading: false, error: 'network down' });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('network down');

    (el.querySelector('[data-bridge-plan-retry]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-bridge-plan-card]')).not.toBeNull();
    });
  });
});
