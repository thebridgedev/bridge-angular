/**
 * TBP-654 / TBP-653 — the page the user is already on is re-checked when a
 * verdict can have changed, and the guard fails closed without a config.
 *
 * Angular guards run on navigation only. Before this, a session that ended on
 * a protected page, or a downgrade on a plan-gated one, left the page rendered
 * until the next click. Every assertion is about the destination.
 */
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RETURN_TO_STORAGE_KEY } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { AuthService } from '../shared/services/auth.service';
import {
  __resetBridgeRouteGuardState,
  bridgeAuthGuard,
  recheckBridgeRoute,
  type RouteGuardConfig,
} from './route-guard';

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/auth/login', public: true },
    { match: '/upgrade' },
    { match: '/pro', featureFlag: 'pro-page', redirectTo: '/upgrade' },
  ],
  defaultAccess: 'protected',
};

class StubAuth {
  authenticated = true;
  isAuthenticated() {
    return this.authenticated;
  }
  createLoginUrl() {
    return 'https://login.example/login?app=x';
  }
  getBridgeAuth() {
    return { shouldRedirectToPaywall: async () => false };
  }
}

class StubBridge {
  flags: Record<string, boolean> = { 'pro-page': true };
  evaluate(key: string) {
    return { passed: !!this.flags[key] };
  }
}

interface StubRouter {
  url: string;
  parseUrl: (u: string) => { __parsed: string };
  navigateByUrl: ReturnType<typeof vi.fn>;
}

let auth: StubAuth;
let flags: StubBridge;
let router: StubRouter;
let config: Record<string, unknown>;
let guardConfig: () => RouteGuardConfig;
let injector: Injector;

function configure(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: BridgeService, useValue: flags },
      {
        provide: BridgeConfigService,
        useValue: { getConfig: () => ({ appId: 'x', ...config }), getRouteGuardConfig: () => guardConfig() },
      },
      { provide: Router, useValue: router },
    ],
  });
  injector = TestBed.inject(Injector);
}

/** Run the guard for `url`; on allow the router lands there, as Angular would. */
async function navigate(url: string): Promise<unknown> {
  const res = await TestBed.runInInjectionContext(() => bridgeAuthGuard()({} as never, { url } as never));
  if (res === true) router.url = url;
  return res;
}

beforeEach(() => {
  __resetBridgeRouteGuardState();
  sessionStorage.clear();
  auth = new StubAuth();
  flags = new StubBridge();
  config = { loginRoute: '/auth/login' };
  guardConfig = () => routeConfig;
  router = {
    url: '/',
    parseUrl: (u: string) => ({ __parsed: u }),
    navigateByUrl: vi.fn(async (tree: { __parsed: string }) => {
      router.url = tree.__parsed;
      return true;
    }),
  };
  configure();
});

describe('the current page is re-checked after an authorization change (TBP-654)', () => {
  it('session ended on a protected page → login, carrying the page as return target (TBP-629)', async () => {
    expect(await navigate('/dashboard?tab=2')).toBe(true);
    auth.authenticated = false;

    await recheckBridgeRoute(injector);

    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl.mock.calls[0][0]).toEqual({
      __parsed: '/auth/login?redirectUri=%2Fdashboard%3Ftab%3D2',
    });
    expect(router.url).toBe('/auth/login?redirectUri=%2Fdashboard%3Ftab%3D2');
  });

  it('hosted mode: session ended → the page is stashed for the OAuth callback', async () => {
    config = {};
    configure();
    expect(await navigate('/dashboard')).toBe(true);
    auth.authenticated = false;

    await recheckBridgeRoute(injector);

    expect(sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe('/dashboard');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('downgrade on a plan-gated page → the rule’s redirectTo', async () => {
    expect(await navigate('/pro')).toBe(true);
    flags.flags['pro-page'] = false;

    await recheckBridgeRoute(injector);

    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/upgrade');
  });

  it('a verdict that still holds leaves the page alone', async () => {
    expect(await navigate('/pro')).toBe(true);
    await recheckBridgeRoute(injector);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('a page outside the guarded tree is never touched', async () => {
    expect(await navigate('/pro')).toBe(true);
    router.url = '/unguarded'; // navigated to a route without bridgeAuthGuard
    auth.authenticated = false;

    await recheckBridgeRoute(injector);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('upgrade: the route refused on Free is allowed on the next navigation, no reload', async () => {
    flags.flags['pro-page'] = false;
    expect(await navigate('/pro')).toEqual({ __parsed: '/upgrade' });
    flags.flags['pro-page'] = true; // plan_changed / new token moved the rule inputs
    expect(await navigate('/pro')).toBe(true);
  });
});

