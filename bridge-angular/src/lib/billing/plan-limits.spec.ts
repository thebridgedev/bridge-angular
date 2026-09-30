/**
 * TBP-744 — plan limits at levels 0, 1 and 2, from the Angular plugin alone.
 *   level 0: `bridgeInterceptor` / `bridgeFetch` — a 402 opens the upgrade dialog
 *   level 1: `<bridge-quota-gate>`, `[bridgeQuotaGate]`, `*bridgeEntitled`,
 *            `<bridge-feature-flag [upgrade]>`
 *   level 2: `injectQuota()` / `injectEntitlements()`
 *
 * Revert-proof: none of these exist on origin/main (no interceptor, no dialog,
 * no gate, no quota signal, no `upgrade` input on the flag component).
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBridge } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../shared/services/auth.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { FeatureFlagComponent } from '../components/feature-flag/feature-flag.component';
import {
  BridgeQuotaAtLimitDirective,
  QuotaGateComponent,
  QuotaGateDirective,
} from '../components/subscription/quota-gate.component';
import { EntitledDirective } from '../components/subscription/entitled.directive';
import {
  BridgeUpgradeDialogComponent,
  plansIncludingFeature,
} from '../components/subscription/upgrade-dialog.component';
import {
  resolveUpgradeDialog,
  upgradeDialogInputs,
} from '../components/subscription/upgrade-dialog.mounter';
import { bridgeFetch, bridgeInterceptor, setBridgeFetchAuth } from './bridge-http';
import {
  __resetRefusalsForTests,
  featureUpgrade,
  observeRefusalBody,
  onBridgeQuotaExceeded,
  parseQuotaRefusal,
  quotaRefusal,
  safeFixPath,
  watchesOrigin,
} from './quota-refusal';
import { quotaGateState, readQuotaState } from './quota-state';

const QUOTA_BODY = { statusCode: 402, code: 'QUOTA_EXCEEDED', metric: 'tickets', used: 10, limit: 10, fix: '/subscription' };

function authStub(token: string | null = 'tok-1') {
  const tokens = signal(token ? { accessToken: token, refreshToken: 'r', idToken: 'i' } : null);
  return {
    tokens,
    isAuthenticated: () => !!tokens(),
    getToken: () => tokens(),
    refreshToken: vi.fn(async () => {
      tokens.set({ accessToken: 'tok-2', refreshToken: 'r', idToken: 'i' });
      return tokens();
    }),
    subscription: signal({ status: null, plans: null, loading: false, error: null }),
    getBridgeAuth: () => ({ canManageBilling: () => true }),
  };
}

beforeEach(() => {
  __resetRefusalsForTests();
  TestBed.resetTestingModule();
});

describe('refusal parsing (level 0)', () => {
  it('recognises a QUOTA_EXCEEDED body and keeps only a same-app fix', () => {
    expect(parseQuotaRefusal(QUOTA_BODY, '/api/tickets')).toMatchObject({ metric: 'tickets', used: 10, limit: 10, fix: '/subscription' });
    expect(parseQuotaRefusal({ ...QUOTA_BODY, fix: 'https://evil.example' })?.fix).toBeNull();
    expect(parseQuotaRefusal({ code: 'card_declined' })).toBeNull();
    expect(safeFixPath('//evil.example')).toBeNull();
    expect(safeFixPath('javascript:alert(1)')).toBeNull();
  });

  it('a feature refusal opens the feature variant', () => {
    expect(observeRefusalBody({ code: 'FEATURE_NOT_IN_PLAN', flag: 'reports', feature: 'advanced_reports' })).toBe('feature');
    expect(featureUpgrade()).toEqual({ flag: 'reports', feature: 'advanced_reports', fix: null });
  });

  it('only the app, Bridge and listed origins are watched', () => {
    const opts = { pageOrigin: 'https://app.example', apiBaseUrl: 'https://api.thebridge.dev', apiOrigins: ['https://api.example'] };
    expect(watchesOrigin('/api/x', opts)).toBe(true);
    expect(watchesOrigin('https://api.example/x', opts)).toBe(true);
    expect(watchesOrigin('https://api.thebridge.dev/usage', opts)).toBe(true);
    expect(watchesOrigin('https://api.stripe.com/v1', opts)).toBe(false);
  });
});

describe('bridgeInterceptor (level 0)', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: ReturnType<typeof authStub>;

  beforeEach(() => {
    auth = authStub();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([bridgeInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    TestBed.inject(BridgeConfigService).initConfig({ appId: 'a', apiBaseUrl: 'https://api.thebridge.dev', billing: { apiOrigins: ['https://backend.example'] } });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('sends the token to the app backend but never to a third party', async () => {
    const own = firstValueFrom(http.get('https://backend.example/tickets'));
    const req = ctrl.expectOne('https://backend.example/tickets');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-1');
    req.flush([]);
    await own;

    const other = firstValueFrom(http.get('https://third.example/data'));
    const req2 = ctrl.expectOne('https://third.example/data');
    expect(req2.request.headers.has('Authorization')).toBe(false);
    req2.flush({});
    await other;
  });

  it('a 402 QUOTA_EXCEEDED opens the upgrade dialog and still reaches the caller', async () => {
    const heard = vi.fn();
    onBridgeQuotaExceeded(heard);
    const call = firstValueFrom(http.post('https://backend.example/tickets', {}));
    ctrl.expectOne('https://backend.example/tickets').flush(QUOTA_BODY, { status: 402, statusText: 'Payment Required' });
    await expect(call).rejects.toMatchObject({ status: 402 });
    expect(quotaRefusal()).toMatchObject({ metric: 'tickets', used: 10, limit: 10 });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('a 402 from a third party opens nothing', async () => {
    const call = firstValueFrom(http.post('https://third.example/pay', {}));
    ctrl.expectOne('https://third.example/pay').flush(QUOTA_BODY, { status: 402, statusText: 'Payment Required' });
    await expect(call).rejects.toMatchObject({ status: 402 });
    expect(quotaRefusal()).toBeNull();
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    const call = firstValueFrom(http.get('https://backend.example/me'));
    ctrl.expectOne('https://backend.example/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    await Promise.resolve();
    const retry = ctrl.expectOne('https://backend.example/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer tok-2');
    retry.flush({ ok: true });
    expect(await call).toEqual({ ok: true });
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
  });
});

describe('bridgeFetch (level 0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setBridgeFetchAuth(null);
  });

  it('adds the token and opens the dialog on a 402, returning the response unchanged', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(QUOTA_BODY), { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    setBridgeFetchAuth(authStub() as unknown as AuthService);
    const res = await bridgeFetch('/api/tickets', { method: 'POST' });
    expect(res.status).toBe(402);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1');
    expect(quotaRefusal()?.metric).toBe('tickets');
  });
});

describe('the upgrade dialog', () => {
  it('is on unless turned off; a component replaces it', () => {
    class Mine {}
    expect(resolveUpgradeDialog(undefined)).toBe('default');
    expect(resolveUpgradeDialog({ upgradeDialog: false })).toBeNull();
    expect(resolveUpgradeDialog({ upgradeDialog: Mine })).toBe(Mine);
  });

  it('links to the fix, else the subscription page; a member gets no upgrade', () => {
    const refusal = parseQuotaRefusal({ ...QUOTA_BODY, fix: undefined })!;
    const admin = upgradeDialogInputs(refusal, null, undefined, () => true, null);
    expect(admin).toMatchObject({ upgradeHref: '/subscription', canUpgrade: true, feature: null });
    const member = upgradeDialogInputs(refusal, null, { manageRoute: '/billing' }, () => {
      throw new Error('no auth');
    }, null);
    expect(member).toMatchObject({ upgradeHref: '/billing', canUpgrade: false });
  });

  it('names the plans that include a missing feature, cheapest first', () => {
    const plans = [
      { key: 'biz', name: 'Business', prices: [{ amount: 99 }], features: [{ key: 'sso', name: 'SSO' }] },
      { key: 'pro', name: 'Pro', prices: [{ amount: 20 }], features: [{ key: 'sso', name: 'SSO' }] },
      { key: 'free', name: 'Free', prices: [{ amount: 0 }], features: [] },
    ] as never;
    expect(plansIncludingFeature(plans, 'sso')).toEqual(['Pro', 'Business']);
  });

  it('renders the numbers for an admin and the owner line for a member', () => {
    TestBed.configureTestingModule({ imports: [BridgeUpgradeDialogComponent] });
    const fixture = TestBed.createComponent(BridgeUpgradeDialogComponent);
    fixture.componentRef.setInput('refusal', parseQuotaRefusal(QUOTA_BODY));
    fixture.componentRef.setInput('canUpgrade', true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-bridge-upgrade-dialog]')?.getAttribute('data-variant')).toBe('limit');
    expect(el.textContent).toContain('10');
    expect(el.querySelector('[data-bridge-upgrade-dialog-cta]')?.getAttribute('href')).toBe('/subscription');

    fixture.componentRef.setInput('canUpgrade', false);
    fixture.detectChanges();
    expect(el.textContent).toContain('Contact your workspace owner.');
    expect(el.querySelector('[data-bridge-upgrade-dialog-cta]')).toBeNull();
  });
});

describe('quota state (level 2)', () => {
  function fakeStore() {
    const snaps = new Map<string, unknown>();
    const listeners = new Set<(m: string, s: unknown) => void>();
    return {
      snaps,
      get: (m: string) => snaps.get(m),
      ensureHydrated: (m: string) => snaps.get(m),
      subscribe: (l: (m: string, s: unknown) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      emit(m: string, s: unknown) {
        if (s) snaps.set(m, s);
        else snaps.delete(m);
        for (const l of listeners) l(m, s);
      },
    };
  }

  it('has no number until there is a real one', () => {
    const store = fakeStore();
    const q = readQuotaState('tickets', store as never);
    expect(q).toMatchObject({ loading: true, used: null, limit: null, remaining: null });
    expect(quotaGateState(q)).toBe('loading');
  });

  it('reads a snapshot, and knows a hard cap from a metered one', () => {
    const store = fakeStore();
    store.emit('tickets', { metric: 'tickets', used: 10, limit: 10, remaining: 0, policy: 'hard', kind: 'gauge', warningLevel: 'critical' });
    const q = readQuotaState('tickets', store as never);
    expect(q).toMatchObject({ loading: false, used: 10, limit: 10, kind: 'gauge' });
    expect(quotaGateState(q)).toBe('at-limit');
    store.emit('tickets', { metric: 'tickets', used: 10, limit: 10, remaining: 0, policy: 'metered' });
    expect(quotaGateState(readQuotaState('tickets', store as never))).toBe('metered');
  });

  it('remembers that the plan has no quota on a metric', () => {
    const store = fakeStore();
    readQuotaState('exports', store as never);
    store.emit('exports', undefined);
    expect(readQuotaState('exports', store as never)).toMatchObject({ loading: false, unlimited: true });
  });
});

@Component({
  standalone: true,
  imports: [QuotaGateComponent, BridgeQuotaAtLimitDirective, QuotaGateDirective],
  template: `
    <bridge-quota-gate [metric]="metric">
      <button data-create>New</button>
      <span *bridgeQuotaAtLimit="let q" data-custom>{{ q.used }} of {{ q.limit }}</span>
    </bridge-quota-gate>
    <button data-single [bridgeQuotaGate]="metric">One</button>
  `,
})
class GateHost {
  metric = '';
}

describe('<bridge-quota-gate> and [bridgeQuotaGate] (level 1)', () => {
  it('disables the action only at a known hard cap', () => {
    const metric = `gate-${Math.random()}`;
    TestBed.configureTestingModule({ imports: [GateHost], providers: [{ provide: AuthService, useValue: authStub() }] });
    const fixture = TestBed.createComponent(GateHost);
    fixture.componentInstance.metric = metric;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const fieldset = el.querySelector('fieldset') as HTMLFieldSetElement;

    // Loading: never disabled on "don't know yet".
    expect(el.querySelector('[data-bridge-quota-gate]')?.getAttribute('data-state')).toBe('loading');
    expect(fieldset.disabled).toBe(false);

    useBridge().quotas.applyQuotaUpdated({
      metric,
      used: 3,
      limit: 3,
      remaining: 0,
      policy: 'hard',
      warningLevel: 'critical',
    } as never);
    fixture.detectChanges();
    expect(el.querySelector('[data-bridge-quota-gate]')?.getAttribute('data-state')).toBe('at-limit');
    expect(fieldset.disabled).toBe(true);
    expect(el.querySelector('[data-custom]')?.textContent).toBe('3 of 3');
    const single = el.querySelector('[data-single]') as HTMLButtonElement;
    expect(single.disabled).toBe(true);
    expect(single.getAttribute('data-bridge-quota-state')).toBe('at-limit');

    useBridge().quotas.applyQuotaUpdated({ metric, used: 1, limit: 3, remaining: 2, policy: 'hard' } as never);
    fixture.detectChanges();
    expect(fieldset.disabled).toBe(false);
    expect(single.disabled).toBe(false);
  });
});

@Component({
  standalone: true,
  imports: [EntitledDirective],
  template: `
    <p *bridgeEntitled="'analytics'; else upgrade; loading: wait" data-paid>paid</p>
    <ng-template #upgrade><p data-upgrade>upgrade</p></ng-template>
    <ng-template #wait><p data-wait>wait</p></ng-template>
  `,
})
class EntitledHost {}

describe('*bridgeEntitled (level 1, the exception)', () => {
  it('shows loading, then the content or the else, from the plan', async () => {
    const { applyEntitlementsChanged, __resetSnapshotStores } = await import('../core/snapshot-stores');
    __resetSnapshotStores();
    TestBed.configureTestingModule({ imports: [EntitledHost], providers: [{ provide: AuthService, useValue: authStub() }] });
    const fixture = TestBed.createComponent(EntitledHost);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-wait]')).not.toBeNull();
    expect(el.querySelector('[data-paid]')).toBeNull();

    applyEntitlementsChanged({ entitlements: { analytics: false } });
    fixture.detectChanges();
    expect(el.querySelector('[data-upgrade]')).not.toBeNull();

    applyEntitlementsChanged({ entitlements: { analytics: true } });
    fixture.detectChanges();
    expect(el.querySelector('[data-paid]')).not.toBeNull();
    expect(el.querySelector('[data-upgrade]')).toBeNull();
    __resetSnapshotStores();
  });
});

@Component({
  standalone: true,
  imports: [FeatureFlagComponent],
  template: `<bridge-feature-flag key="analytics" [upgrade]="true"><p data-on>on</p></bridge-feature-flag>`,
})
class FlagHost {}

describe('<bridge-feature-flag [upgrade]> (level 1)', () => {
  it('a feature off because of the plan offers an upgrade; clicking it opens the dialog', () => {
    let reason: string | undefined = 'plan';
    TestBed.configureTestingModule({
      imports: [FlagHost],
      providers: [
        {
          provide: BridgeService,
          useValue: {
            _flagVersions: () => 0,
            evaluate: () => ({ passed: false, value: false, reason, feature: reason === 'plan' ? 'analytics' : undefined }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(FlagHost);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('[data-bridge-feature-upgrade]') as HTMLButtonElement;
    expect(button?.textContent).toContain('Upgrade to use this');
    // Rendering opened nothing.
    expect(featureUpgrade()).toBeNull();
    button.click();
    expect(featureUpgrade()).toEqual({ flag: 'analytics', feature: 'analytics', fix: null });

    reason = 'permission';
    const other = TestBed.createComponent(FlagHost);
    other.detectChanges();
    expect((other.nativeElement as HTMLElement).querySelector('[data-bridge-feature-upgrade]')).toBeNull();
  });
});

describe('bridge.usage — browser counting (parity with svelte TBP-697)', () => {
  it('reports a counter and sets a gauge through auth-core', async () => {
    const usage = { report: vi.fn(), set: vi.fn(async () => {}), getQueueStatus: vi.fn(async () => ({})) };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { ...authStub(), getBridgeAuth: () => ({ usage }) } }],
    });
    const bridge = TestBed.inject(BridgeService);
    bridge.usage.report('exports');
    await bridge.usage.set('projects', 8);
    expect(usage.report).toHaveBeenCalledWith('exports', undefined, undefined);
    expect(usage.set).toHaveBeenCalledWith('projects', 8);
  });
});
