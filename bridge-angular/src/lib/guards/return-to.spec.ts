import { TestBed } from '@angular/core/testing';
import { Router, type CanActivateFn } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { RETURN_TO_STORAGE_KEY } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { AuthService } from '../shared/services/auth.service';
import { bridgeAuthGuard, type RouteGuardConfig } from './route-guard';

/**
 * TBP-629 — deep-link preservation in `bridgeAuthGuard`.
 *
 * bridge-angular is the one package whose guard is a local reimplementation
 * rather than a wrapper over auth-core's `createRouteGuard`, so the exclusion
 * rules genuinely need their own coverage here — borrowing react's would prove
 * nothing about this code.
 *
 * The bug is silent: follow a link into a protected page, sign in, land on the
 * default route, no error anywhere. So every assertion below is about the
 * DESTINATION, not merely that a redirect happened.
 */

const HOSTED_URL = 'https://login.example/login?app=x';

/** Every argument list `createLoginUrl` was called with, in order. */
const loginUrlCalls: unknown[][] = [];

class StubAuth {
  authenticated = false;
  isAuthenticated() {
    return this.authenticated;
  }
  createLoginUrl(...args: unknown[]) {
    loginUrlCalls.push(args);
    return HOSTED_URL;
  }
  getBridgeAuth() {
    return { shouldRedirectToPaywall: async () => false };
  }
}

class StubBridge {
  evaluate() {
    return { passed: true };
  }
}

function runGuard(url: string, config: Record<string, unknown>, routeConfig?: RouteGuardConfig) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useClass: StubAuth },
      { provide: BridgeService, useClass: StubBridge },
      {
        provide: BridgeConfigService,
        useValue: {
          getConfig: () => ({ appId: 'x', ...config }),
          getRouteGuardConfig: () =>
            routeConfig ?? ({ rules: [], defaultAccess: 'protected' } as RouteGuardConfig),
        },
      },
      {
        provide: Router,
        useValue: {
          parseUrl: (u: string) => ({ __parsed: u }),
          createUrlTree: (segs: string[]) => ({ __tree: segs }),
        },
      },
    ],
  });

  const guard: CanActivateFn = bridgeAuthGuard();
  return TestBed.runInInjectionContext(() =>
    guard({} as never, { url } as never),
  ) as Promise<unknown>;
}

// jsdom pins both `window` and `window.location`, so the hosted branch's
// `window.location.href = …` cannot be observed directly. It is pre-existing
// behaviour anyway; what TBP-629 added is the stash and the ARGUMENTS handed to
// createLoginUrl, and both are observable on the stub.
beforeEach(() => {
  sessionStorage.clear();
  loginUrlCalls.length = 0;
});

describe('SDK mode — the target rides on the app’s own login route', () => {
  it('carries path and query', async () => {
    const res: any = await runGuard('/incident/42?tab=files', { loginRoute: '/auth/login' });
    expect(res.__parsed).toBe('/auth/login?redirectUri=%2Fincident%2F42%3Ftab%3Dfiles');
  });

  it('is parsed, not turned into a single path segment', async () => {
    // `createUrlTree(['/auth/login?redirectUri=…'])` treats the whole string as
    // ONE segment and drops the query — which would silently discard the return
    // target the login branch just attached.
    const res: any = await runGuard('/incident/42', { loginRoute: '/auth/login' });
    expect(res.__tree).toBeUndefined();
    expect(res.__parsed).toContain('redirectUri=');
  });

  it('does not send the login route back to itself', async () => {
    const res: any = await runGuard('/auth/login', { loginRoute: '/auth/login' });
    // The guard already refuses to redirect the login route to itself, so this
    // is an `allow`; what matters is that nothing self-referential was built.
    expect(JSON.stringify(res)).not.toContain('redirectUri');
  });

  it('honours an exclusion pattern', async () => {
    const res: any = await runGuard(
      '/auth/callback',
      { loginRoute: '/auth/login' },
      {
        rules: [],
        defaultAccess: 'protected',
        returnTo: { exclude: [new RegExp('^/auth($|/)')] },
      },
    );
    expect(JSON.stringify(res)).not.toContain('redirectUri');
  });

  it('keeps today’s behaviour exactly when opted out', async () => {
    const res: any = await runGuard('/incident/42', {
      loginRoute: '/auth/login',
      returnTo: { enabled: false },
    });
    expect(res.__parsed).toBe('/auth/login');
  });

  it('respects a custom parameter name', async () => {
    const res: any = await runGuard('/incident/42', {
      loginRoute: '/auth/login',
      returnTo: { param: 'next' },
    });
    expect(res.__parsed).toBe('/auth/login?next=%2Fincident%2F42');
  });

  it('never returns somebody to a public route', async () => {
    // A public route is not what the guard turned them away from, so sending
    // them "back" to one after login is noise.
    const res: any = await runGuard(
      '/pricing',
      { loginRoute: '/auth/login' },
      { rules: [{ match: '/pricing', public: true }], defaultAccess: 'protected' },
    );
    expect(JSON.stringify(res)).not.toContain('redirectUri');
  });
});

describe('hosted mode — the target goes to storage, never the OAuth URL', () => {
  it('stashes the target and leaves the OAuth request untouched', async () => {
    const res = await runGuard('/incident/42?tab=files', {});

    // The load-bearing assertion: nothing was handed to createLoginUrl.
    // bridge-api validates `redirect_uri` with an exact
    // `allowedRedirectUris.includes()` match, so putting the deep link anywhere
    // near that call breaks login outright rather than improving it.
    expect(loginUrlCalls).toEqual([[]]);
    expect(sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe('/incident/42?tab=files');
    // 'login' decisions deny the navigation and hand off to the portal.
    expect(res).toBe(false);
  });

  it('stashes nothing when opted out', async () => {
    await runGuard('/incident/42', { returnTo: { enabled: false } });
    expect(sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBeNull();
  });
});

describe('hostile return targets never reach a navigation', () => {
  const hostile = [
    ['a protocol-relative URL', '//evil.test/x'],
    ['the backslash spelling of protocol-relative', '/\\evil.test'],
    ['a backslash anywhere', '/a\\b'],
  ] as const;

  for (const [label, url] of hostile) {
    it(`rejects ${label}`, async () => {
      const res: any = await runGuard(url, { loginRoute: '/auth/login' });
      expect(JSON.stringify(res)).not.toContain('evil.test');
      expect(JSON.stringify(res)).not.toContain('redirectUri');
    });
  }
});
