/**
 * TBP-654 — bootstrap wires authorization changes to a route re-check,
 * debounced: one plan change arrives as a burst (plan_changed +
 * entitlements.changed + user.state_changed + the token refresh it causes) and
 * must cost one re-check, not four.
 */
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../guards/route-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../guards/route-guard')>()),
  recheckBridgeRoute: vi.fn(async () => {}),
}));

vi.mock('../core/startup-reads', () => ({
  loadBeforeFirstRender: vi.fn(async () => {}),
}));

import { recheckBridgeRoute } from '../guards/route-guard';
import { loadBeforeFirstRender } from '../core/startup-reads';
import { BridgeBootstrapService } from './bridge-bootstrap.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeService } from '../core/bridge.service';

let authzHandler: ((reason: string) => void) | undefined;
let definitionsLoaded: Promise<void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(recheckBridgeRoute).mockClear();
  vi.mocked(loadBeforeFirstRender).mockReset().mockResolvedValue(undefined);
  authzHandler = undefined;
  definitionsLoaded = Promise.resolve();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BridgeConfigService,
        useValue: { initConfig: () => {}, getConfig: () => ({ appId: 'app-1' }) },
      },
      {
        provide: AuthService,
        useValue: {
          initBridge: () => {},
          maybeRefreshNow: async () => false,
          markReady: () => {},
          getBridgeAuth: () => ({ getApiContext: () => ({ apiBaseUrl: 'http://api.test.local', appId: 'app-1', accessToken: null }) }),
        },
      },
      {
        provide: BridgeRuntimeService,
        useValue: {
          start: () => {},
          onTokens: () => () => {},
          onAuthorizationChange: (h: (reason: string) => void) => {
            authzHandler = h;
            return () => {};
          },
          onFlagChange: () => () => {},
          emitFlagChange: () => {},
        },
      },
      {
        provide: BridgeService,
        useValue: { initFlags: () => ({ definitionsLoaded }), applyAuthContext: () => {} },
      },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('authorization changes re-check the current route (TBP-654)', () => {
  it('a burst of changes costs exactly one re-check, against the app injector', async () => {
    await TestBed.inject(BridgeBootstrapService).bootstrap('app-1');
    expect(authzHandler).toBeTypeOf('function');

    authzHandler!('subscription.plan_changed');
    authzHandler!('entitlements.changed');
    authzHandler!('user.state_changed');
    authzHandler!('token');
    expect(recheckBridgeRoute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(recheckBridgeRoute).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recheckBridgeRoute).mock.calls[0][0]).toBe(TestBed.inject(Injector));
  });

  it('changes far apart each get their own re-check', async () => {
    await TestBed.inject(BridgeBootstrapService).bootstrap('app-1');
    authzHandler!('token');
    await vi.advanceTimersByTimeAsync(200);
    authzHandler!('token');
    await vi.advanceTimersByTimeAsync(200);
    expect(recheckBridgeRoute).toHaveBeenCalledTimes(2);
  });
});

describe('the first render waits for the startup reads (TBP-810)', () => {
  it('bootstrap resolves only after the plan reads settle, and hands them the flag definitions', async () => {
    let release!: () => void;
    vi.mocked(loadBeforeFirstRender).mockImplementation(() => new Promise<void>((r) => (release = r)));
    let done = false;
    const boot = TestBed.inject(BridgeBootstrapService)
      .bootstrap('app-1')
      .then(() => (done = true));

    await vi.advanceTimersByTimeAsync(10);
    expect(loadBeforeFirstRender).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadBeforeFirstRender).mock.calls[0][0]).toBe(TestBed.inject(AuthService));
    expect(vi.mocked(loadBeforeFirstRender).mock.calls[0][1]).toBe(definitionsLoaded);
    expect(done).toBe(false);
    expect(TestBed.inject(BridgeBootstrapService).ready()).toBe(false);

    release();
    await boot;
    expect(done).toBe(true);
    expect(TestBed.inject(BridgeBootstrapService).ready()).toBe(true);
  });
});
