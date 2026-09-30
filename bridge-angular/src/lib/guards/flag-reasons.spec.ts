/**
 * TBP-756 — a route refused by a feature flag says why.
 *
 * auth-core 0.8 reports why a flag is off (`FlagEvalResult.reason` /
 * `.feature`) and its route guard puts it on the redirect decision. Angular's
 * guard evaluates flags itself, so it dropped the reason: the page the user was
 * sent to could not tell "upgrade to Pro for this" from "you do not have
 * access". The redirect now carries it in the navigation state.
 */
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RedirectCommand, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { AuthService } from '../shared/services/auth.service';
import {
  BRIDGE_RESTRICTION_STATE_KEY,
  __resetBridgeRouteGuardState,
  bridgeAuthGuard,
  evaluateFlagRequirement,
  recheckBridgeRoute,
  type RouteGuardConfig,
} from './route-guard';

type Off = { reason?: string; feature?: string };

class StubBridge {
  on: Record<string, boolean> = {};
  off: Record<string, Off> = {};
  evaluate(key: string) {
    return this.on[key] ? { passed: true, value: true } : { passed: false, value: false, ...this.off[key] };
  }
}

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/upgrade' },
    { match: '/reports', featureFlag: 'reports', redirectTo: '/upgrade' },
  ],
  defaultAccess: 'protected',
};

let flags: StubBridge;
let router: { url: string; parseUrl: (u: string) => { __parsed: string }; navigateByUrl: ReturnType<typeof vi.fn> };
let injector: Injector;

beforeEach(() => {
  __resetBridgeRouteGuardState();
  flags = new StubBridge();
  router = {
    url: '/',
    parseUrl: (u: string) => ({ __parsed: u }),
    navigateByUrl: vi.fn(async (tree: { __parsed: string }) => {
      router.url = tree.__parsed;
      return true;
    }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => true,
          createLoginUrl: () => 'https://login.example',
          getBridgeAuth: () => ({ shouldRedirectToPaywall: async () => false }),
        },
      },
      { provide: BridgeService, useValue: flags },
      {
        provide: BridgeConfigService,
        useValue: { getConfig: () => ({ appId: 'x' }), getRouteGuardConfig: () => routeConfig },
      },
      { provide: Router, useValue: router },
    ],
  });
  injector = TestBed.inject(Injector);
});

async function navigate(url: string): Promise<unknown> {
  const res = await TestBed.runInInjectionContext(() => bridgeAuthGuard()({} as never, { url } as never));
  if (res === true) router.url = url;
  return res;
}

describe('the guard redirect carries why the flag refused (TBP-756)', () => {
  it('plan: the redirect names the reason, the flag and the plan feature', async () => {
    flags.off['reports'] = { reason: 'plan', feature: 'advanced_reports' };
    const res = await navigate('/reports');

    expect(res).toBeInstanceOf(RedirectCommand);
    const cmd = res as RedirectCommand;
    expect(cmd.redirectTo).toEqual({ __parsed: '/upgrade' });
    expect(cmd.navigationBehaviorOptions?.state?.[BRIDGE_RESTRICTION_STATE_KEY]).toEqual({
      reason: 'plan',
      flag: 'reports',
      feature: 'advanced_reports',
    });
  });

  it('a flag that says nothing gives exactly the redirect it gave before', async () => {
    const res = await navigate('/reports');
    expect(res).toEqual({ __parsed: '/upgrade' });
  });

  it('the re-check of the current page carries it too', async () => {
    flags.on['reports'] = true;
    expect(await navigate('/reports')).toBe(true);
    flags.on['reports'] = false;
    flags.off['reports'] = { reason: 'permission' };

    await recheckBridgeRoute(injector);

    expect(router.url).toBe('/upgrade');
    expect(router.navigateByUrl.mock.calls[0][1]).toEqual({
      replaceUrl: true,
      state: { [BRIDGE_RESTRICTION_STATE_KEY]: { reason: 'permission', flag: 'reports' } },
    });
  });
});

describe('which reason a multi-flag requirement reports (same choice as auth-core)', () => {
  const bridge = () => flags as unknown as BridgeService;

  it('any: the flag closest to "an upgrade alone opens it" wins', () => {
    flags.off = { a: { reason: 'off' }, b: { reason: 'plan', feature: 'pro' }, c: { reason: 'permission' } };
    expect(evaluateFlagRequirement({ any: ['a', 'b', 'c'] }, bridge())).toEqual({
      ok: false,
      restriction: { reason: 'plan', flag: 'b', feature: 'pro' },
    });
  });

  it('all: only failing flags count, and the one furthest from it wins', () => {
    flags.on = { a: true };
    flags.off = { b: { reason: 'plan' }, c: { reason: 'rollout' } };
    expect(evaluateFlagRequirement({ all: ['a', 'b', 'c'] }, bridge())).toEqual({
      ok: false,
      restriction: { reason: 'rollout', flag: 'c' },
    });
  });

  it('a failing flag with no reason makes the whole reason unknown', () => {
    flags.off = { a: { reason: 'plan' }, b: {} };
    expect(evaluateFlagRequirement({ any: ['a', 'b'] }, bridge())).toEqual({ ok: false });
  });

  it('passing requirements carry no restriction', () => {
    flags.on = { a: true };
    expect(evaluateFlagRequirement({ any: ['a', 'b'] }, bridge())).toEqual({ ok: true });
    expect(evaluateFlagRequirement('a', bridge())).toEqual({ ok: true });
  });
});
