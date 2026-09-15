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

import { recheckBridgeRoute } from '../guards/route-guard';
import { BridgeBootstrapService } from './bridge-bootstrap.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeService } from '../core/bridge.service';

let authzHandler: ((reason: string) => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(recheckBridgeRoute).mockClear();
  authzHandler = undefined;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BridgeConfigService,
        useValue: { initConfig: () => {}, getConfig: () => ({ appId: 'app-1' }) },
      },
      {
        provide: AuthService,
        useValue: { initBridge: () => {}, maybeRefreshNow: async () => false, markReady: () => {} },
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
        },
      },
      { provide: BridgeService, useValue: { initFlags: () => {}, applyAuthContext: () => {} } },
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
