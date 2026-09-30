/**
 * TBP-762 — every billing and quota read the plugin makes renews an
 * out-of-date sign-in.
 *
 * Right after a checkout Bridge marks the sign-in out of date. The billing
 * reads the plugin made carried only the access token, so a read in that
 * window answered `401 TOKEN_VERSION_STALE` and the page showed
 * "Subscription unavailable" until a reload. auth-core 0.8 retries such a read
 * once when it is given `onTokenStale` — `BridgeAuth.tokenStaleHandler()`.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBridge } from '@nebulr-group/bridge-auth-core';
import { BridgeRuntimeService } from './bridge-runtime.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { SubscriptionStatusComponent } from '../components/subscription/subscription-status.component';
import { BillingNoticeComponent } from '../components/subscription/billing-notice.component';

const API = 'http://api.test.local';
const staleHandler = async () => 'fresh-token';

class StubAuthService {
  readonly tokens = signal<{ accessToken: string } | null>(null);
  getBridgeAuth() {
    return {
      refreshTokens: async () => null,
      getPlans: async () => [],
      invalidateFeatureFlagCache: () => {},
      tokenStaleHandler: () => staleHandler,
      getApiContext: () => ({ apiBaseUrl: API, accessToken: 'header.eyJ0aWQiOiJ3cy0xIn0.sig', appId: 'app-1' }),
      canManageBilling: () => true,
    };
  }
  async maybeRefreshNow(): Promise<boolean> {
    return false;
  }
}

let auth: StubAuthService;

beforeEach(() => {
  auth = new StubAuthService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'app-1', apiBaseUrl: API }) } },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('billing reads renew a stale sign-in (TBP-762)', () => {
  it('the quota store is configured with the stale-sign-in handler on every token', async () => {
    const configure = vi.spyOn(useBridge().quotas, 'configure');
    const runtime = TestBed.inject(BridgeRuntimeService);
    runtime.start({
      realtime: {
        // No realtime in this test: `/realtime/config` answers noop.
        fetchFn: (async () => ({ ok: true, status: 200, json: async () => ({ kind: 'noop' }) })) as unknown as typeof fetch,
        reportStatus: false,
        diagnose: false,
      },
      fetch: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch,
    });
    configure.mockClear();
    auth.tokens.set({ accessToken: 'header.eyJ0aWQiOiJ3cy0xIn0.sig' });
    TestBed.flushEffects();

    expect(configure).toHaveBeenCalled();
    const opts = configure.mock.calls.at(-1)![0] as { onTokenStale?: unknown };
    expect(opts.onTokenStale).toBe(staleHandler);
    await runtime.stop();
  });

  it('<bridge-subscription-status> passes the handler to its billing read', () => {
    const mount = vi.spyOn(useBridge().subscription, 'mount').mockResolvedValue(undefined as never);
    const fixture = TestBed.createComponent(SubscriptionStatusComponent);
    fixture.detectChanges();

    expect(mount).toHaveBeenCalledTimes(1);
    const opts = mount.mock.calls[0][0] as { onTokenStale?: unknown; accessToken?: string };
    expect(opts.accessToken).toBe('header.eyJ0aWQiOiJ3cy0xIn0.sig');
    expect(opts.onTokenStale).toBe(staleHandler);
    fixture.destroy();
  });

  it('<bridge-billing-notice> passes the handler to its billing read', () => {
    vi.spyOn(useBridge().subscription, 'snapshot').mockReturnValue({ state: null, loading: false, error: null });
    const mount = vi.spyOn(useBridge().subscription, 'mount').mockResolvedValue(undefined as never);
    const fixture = TestBed.createComponent(BillingNoticeComponent);
    fixture.detectChanges();

    expect(mount).toHaveBeenCalledTimes(1);
    const opts = mount.mock.calls[0][0] as { onTokenStale?: unknown };
    expect(opts.onTokenStale).toBe(staleHandler);
    fixture.destroy();
  });
});
