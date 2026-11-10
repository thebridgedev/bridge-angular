/**
 * TBP-575 (port of bridge-svelte) — a route gated by a flag is a live kill
 * switch.
 *
 * Regression: the page the user was on was re-checked only after a plan,
 * entitlements, user-state, token or reconnect change. Switching off the flag a
 * `featureFlag` route rule names left the user on that page until their next
 * click. Now a flag change the current route's rule names re-checks it, and the
 * user lands on the rule's `redirectTo`. Bridge's API is mocked throughout.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlagChange, WebSocketLike } from '@nebulr-group/bridge-auth-core';
import { BridgeBootstrapService } from '../bootstrap/bridge-bootstrap.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeService } from '../core/bridge.service';
import { AuthService } from '../shared/services/auth.service';
import { createBridgeFlags } from '../flags/bootstrap';
import { setBridgeFlagsInstance } from '../flags/registry';
import {
  __resetBridgeRouteGuardState,
  bridgeAuthGuard,
  routeRulesReferenceFlag,
  type RouteGuardConfig,
} from './route-guard';

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/upgrade' },
    { match: '/beta', featureFlag: 'beta-page', redirectTo: '/upgrade' },
    { match: '/reports', featureFlag: { any: ['reports-v1', 'reports-v2'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

// ── The bootstrap + the real route guard ────────────────────────────────────

class StubBridge {
  flags: Record<string, boolean> = { 'beta-page': true, 'reports-v1': true };
  evaluations = 0;
  overrides: { onDefinitionsChanged?: (keys: string[]) => void } | undefined;
  evaluate(key: string) {
    this.evaluations += 1;
    return { passed: !!this.flags[key] };
  }
  initFlags(overrides?: { onDefinitionsChanged?: (keys: string[]) => void }) {
    this.overrides = overrides;
    return { definitionsLoaded: Promise.resolve() };
  }
  applyAuthContext() {}
}

class StubRuntime {
  private flagHandlers = new Set<(c: FlagChange) => void>();
  start() {}
  onAuthorizationChange() {
    return () => {};
  }
  onTokens() {
    return () => {};
  }
  onFlagChange(h: (c: FlagChange) => void) {
    this.flagHandlers.add(h);
    return () => this.flagHandlers.delete(h);
  }
  emitFlagChange(c: FlagChange) {
    for (const h of this.flagHandlers) h(c);
  }
}

const stubAuth = {
  initBridge: () => {},
  maybeRefreshNow: async () => false,
  markReady: () => {},
  isAuthenticated: () => true,
  createLoginUrl: () => 'https://login.example/login',
  getBridgeAuth: () => ({
    shouldRedirectToPaywall: async () => false,
    getApiContext: () => ({ apiBaseUrl: 'http://api.test.local', appId: 'app-1', accessToken: null }),
  }),
};

let flags: StubBridge;
let runtime: StubRuntime;
let router: { url: string; parseUrl: (u: string) => { __parsed: string }; navigateByUrl: ReturnType<typeof vi.fn> };

async function navigate(url: string): Promise<unknown> {
  const res = await TestBed.runInInjectionContext(() => bridgeAuthGuard()({} as never, { url } as never));
  if (res === true) router.url = url;
  return res;
}

describe('a flag switched off while the user is on its route moves them off (TBP-575)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    __resetBridgeRouteGuardState();
    flags = new StubBridge();
    runtime = new StubRuntime();
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
        { provide: AuthService, useValue: stubAuth },
        { provide: BridgeService, useValue: flags },
        { provide: BridgeRuntimeService, useValue: runtime },
        { provide: Router, useValue: router },
        {
          provide: BridgeConfigService,
          useValue: {
            initConfig: () => {},
            getConfig: () => ({ appId: 'app-1', billing: { paywallRoute: false } }),
            getRouteGuardConfig: () => routeConfig,
          },
        },
      ],
    });
    await TestBed.inject(BridgeBootstrapService).bootstrap('app-1', routeConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the flag goes off → the user lands on the rule’s redirectTo, without clicking', async () => {
    expect(await navigate('/beta')).toBe(true);

    flags.flags['beta-page'] = false;
    runtime.emitFlagChange({ key: 'beta-page', kind: 'updated' });
    await vi.advanceTimersByTimeAsync(100);

    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/upgrade');
  });

  it('a removed flag counts too', async () => {
    expect(await navigate('/beta')).toBe(true);
    delete flags.flags['beta-page'];
    runtime.emitFlagChange({ key: 'beta-page', kind: 'removed' });
    await vi.advanceTimersByTimeAsync(100);
    expect(router.url).toBe('/upgrade');
  });

  it('an `any` requirement: losing the last flag that opened it moves the user', async () => {
    expect(await navigate('/reports')).toBe(true);
    flags.flags['reports-v1'] = false;
    runtime.emitFlagChange({ key: 'reports-v1', kind: 'updated' });
    await vi.advanceTimersByTimeAsync(100);
    expect(router.url).toBe('/');
  });

  it('a flag that went off while the connection was down (re-read on reconnect) moves the user too', async () => {
    expect(await navigate('/beta')).toBe(true);
    flags.flags['beta-page'] = false;
    flags.overrides!.onDefinitionsChanged!(['beta-page']);
    await vi.advanceTimersByTimeAsync(100);
    expect(router.url).toBe('/upgrade');
  });

  it('a flag nothing on this route names costs no re-check', async () => {
    expect(await navigate('/beta')).toBe(true);
    const before = flags.evaluations;
    runtime.emitFlagChange({ key: 'show-banner', kind: 'updated' });
    runtime.emitFlagChange({ key: 'reports-v1', kind: 'updated' }); // another route's flag
    await vi.advanceTimersByTimeAsync(100);
    expect(flags.evaluations).toBe(before);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('a burst of messages for the flag costs one re-check', async () => {
    expect(await navigate('/beta')).toBe(true);
    const before = flags.evaluations;
    for (let i = 0; i < 4; i++) runtime.emitFlagChange({ key: 'beta-page', kind: 'updated' });
    await vi.advanceTimersByTimeAsync(100);
    expect(flags.evaluations - before).toBe(1);
  });
});

describe('routeRulesReferenceFlag', () => {
  it('matches string, any and all requirements; scoped to the current route when given', () => {
    const cfg: RouteGuardConfig = {
      rules: [
        { match: '/a', featureFlag: 'x' },
        { match: '/b/*', featureFlag: { all: ['y', 'z'] } },
      ],
    };
    expect(routeRulesReferenceFlag('x', cfg)).toBe(true);
    expect(routeRulesReferenceFlag('z', cfg)).toBe(true);
    expect(routeRulesReferenceFlag('nope', cfg)).toBe(false);
    expect(routeRulesReferenceFlag('x', cfg, '/b/1')).toBe(false);
    expect(routeRulesReferenceFlag('y', cfg, '/b/1')).toBe(true);
    expect(routeRulesReferenceFlag('x', null)).toBe(false);
  });
});

// ── The runtime hears flag changes on the wire ──────────────────────────────

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

describe('the runtime fans out flag changes received on the wire (TBP-575)', () => {
  const invalidate = vi.fn();
  let rt: BridgeRuntimeService;

  beforeEach(() => {
    invalidate.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            tokens: signal(null),
            getBridgeAuth: () => ({ refreshTokens: async () => null, invalidateFeatureFlagCache: invalidate }),
          },
        },
        {
          provide: BridgeConfigService,
          useValue: { getConfig: () => ({ appId: 'app-1', apiBaseUrl: 'http://api.test.local' }) },
        },
      ],
    });
    rt = TestBed.inject(BridgeRuntimeService);
    rt.start({
      realtime: {
        websocketFactory: () => new InertWebSocket(),
        fetchFn: (async () => ({ ok: true, status: 200, json: async () => ({ kind: 'noop' }) })) as unknown as typeof fetch,
        reportStatus: false,
        diagnose: false,
      },
      fetch: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch,
    });
  });

  afterEach(async () => {
    await rt.stop();
  });

  it('flag.updated and flag.removed reach onFlagChange subscribers, legacy cache cleared', () => {
    const seen: FlagChange[] = [];
    rt.onFlagChange((c) => seen.push(c));
    const client = rt.getRealtime() as unknown as { handleMessage: (m: unknown) => void };

    client.handleMessage({ kind: 'flag.updated', flag: { key: 'beta-page', state: 'off' } });
    client.handleMessage({ kind: 'flag.removed', key: 'old-flag' });

    expect(seen).toEqual([
      { key: 'beta-page', kind: 'updated' },
      { key: 'old-flag', kind: 'removed' },
    ]);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

// ── The flags layer reports definitions that changed across a reconnect ────

describe('a re-read of the flag definitions reports what changed (TBP-575)', () => {
  afterEach(() => {
    setBridgeFlagsInstance(undefined);
    vi.unstubAllGlobals();
  });

  it('first read: nothing reported; reconnect read: only the keys that differ', async () => {
    const def = (key: string, state: string) => ({ key, state, valueType: 'boolean', offValue: false, onValue: true });
    let answer = [def('beta-page', 'on'), def('banner', 'on'), def('gone', 'on')];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => answer })));
    let reopen: (() => void) | undefined;
    const changed: string[][] = [];

    const bundle = createBridgeFlags({
      apiBaseUrl: 'http://api.test.local',
      apiKey: 'app-1',
      telemetry: { enabled: false } as never,
      onRealtimeOpen: (h) => {
        reopen = h;
        return () => {};
      },
      onDefinitionsChanged: (keys) => changed.push(keys),
    });
    await bundle.definitionsLoaded;
    expect(changed).toEqual([]);

    answer = [def('beta-page', 'off'), def('banner', 'on')];
    reopen!();
    await vi.waitFor(() => expect(changed).toHaveLength(1));
    expect(changed[0].sort()).toEqual(['beta-page', 'gone']);
    await bundle.stop();
  });
});
