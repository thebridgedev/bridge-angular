/**
 * TBP-744 — what the route guard does for the ten-line integration:
 *   - a page `bridgeAuthRoutes()` serves is public by construction, even when
 *     spread inside the guarded parent;
 *   - the paywall defaults to `/subscription/plan`, but only for an app that
 *     has plans, and `paywallRoute: false` turns it off;
 *   - a route whose flag is off because of the plan opens the upgrade dialog.
 *
 * Revert-proof: on origin/main the guard ignores route data (the login page is
 * sent to login), has no default paywall, and opens nothing.
 */
import { TestBed } from '@angular/core/testing';
import { RedirectCommand, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { AuthService } from '../shared/services/auth.service';
import { __resetRefusalsForTests, featureUpgrade } from '../billing/quota-refusal';
import { BRIDGE_PUBLIC_ROUTE, __resetBridgeRouteGuardState, bridgeAuthGuard, type RouteGuardConfig } from './route-guard';
import type { BridgeConfig } from '../types/config';

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/reports', featureFlag: 'reports', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

let authenticated: boolean;
let needsPlan: boolean;
let plans: unknown[];
let config: BridgeConfig;
let offReason: { reason?: string; feature?: string };

beforeEach(() => {
  __resetBridgeRouteGuardState();
  __resetRefusalsForTests();
  authenticated = true;
  needsPlan = false;
  plans = [{ key: 'pro' }];
  config = { appId: 'x', loginRoute: '/auth/login' };
  offReason = {};
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => authenticated,
          createLoginUrl: () => 'https://login.example',
          getBridgeAuth: () => ({
            shouldRedirectToPaywall: async () => needsPlan,
            getPlans: async () => plans,
          }),
        },
      },
      {
        provide: BridgeService,
        useValue: { evaluate: () => ({ passed: false, value: false, ...offReason }) },
      },
      {
        provide: BridgeConfigService,
        useValue: { getConfig: () => config, getRouteGuardConfig: () => routeConfig },
      },
      { provide: Router, useValue: { url: '/', parseUrl: (u: string) => ({ __parsed: u }) } },
    ],
  });
});

async function navigate(url: string, data: Record<string, unknown> = {}): Promise<unknown> {
  return TestBed.runInInjectionContext(() => bridgeAuthGuard()({ data } as never, { url } as never));
}

describe('bridgeAuthRoutes pages are public by construction (TBP-744)', () => {
  it('lets a signed-out visitor reach a page marked bridgePublic', async () => {
    authenticated = false;
    expect(await navigate('/auth/signup', { [BRIDGE_PUBLIC_ROUTE]: true })).toBe(true);
  });

  it('still sends a signed-out visitor on an unmarked protected page to login', async () => {
    authenticated = false;
    expect(await navigate('/projects')).toEqual({ __parsed: '/auth/login?redirectUri=%2Fprojects' });
  });
});

describe('the default paywall (TBP-744, svelte TBP-702)', () => {
  it('sends a plan-less workspace of an app with plans to /subscription/plan', async () => {
    needsPlan = true;
    expect(await navigate('/projects')).toEqual({ __parsed: '/subscription/plan' });
  });

  it('does not send anyone anywhere when the app has no plans', async () => {
    needsPlan = true;
    plans = [];
    expect(await navigate('/projects')).toBe(true);
  });

  it('an explicit paywallRoute applies even with no plan list', async () => {
    needsPlan = true;
    plans = [];
    config = { ...config, billing: { paywallRoute: '/welcome' } };
    expect(await navigate('/projects')).toEqual({ __parsed: '/welcome' });
  });

  it('paywallRoute: false turns it off', async () => {
    needsPlan = true;
    config = { ...config, billing: { paywallRoute: false } };
    expect(await navigate('/projects')).toBe(true);
  });

  it('leaves the paywall and the payment-error page alone', async () => {
    needsPlan = true;
    expect(await navigate('/subscription/plan')).toBe(true);
    expect(await navigate('/subscription/error')).toBe(true);
  });
});

describe('a plan-gated route opens the upgrade dialog (TBP-744, svelte TBP-756)', () => {
  it('opens the feature variant when the flag is off because of the plan', async () => {
    offReason = { reason: 'plan', feature: 'advanced_reports' };
    const res = await navigate('/reports');
    expect(res).toBeInstanceOf(RedirectCommand);
    expect(featureUpgrade()).toEqual({ flag: 'reports', feature: 'advanced_reports', fix: null });
  });

  it('opens nothing when the flag is off for another reason', async () => {
    offReason = { reason: 'permission' };
    await navigate('/reports');
    expect(featureUpgrade()).toBeNull();
  });
});
