/**
 * TBP-744 — configuration precedence matches the other plugins: explicit
 * option > default, an empty value is unset, a missing app id throws naming
 * the option, and the hosted pages follow the API address on Bridge's domains.
 *
 * Revert-proof: on origin/main `hostedUrl` did not exist (a stage app's hosted
 * sign-in opened on production), `apiBaseUrl: ''` was kept as a value, and the
 * bootstrap never passed a hosted address to auth-core.
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeConfigService } from './bridge-config.service';
import { configWarnings, hostedUrlFor, resolveBridgeConfig } from './resolve-config';
import { BridgeBootstrapService } from '../bootstrap/bridge-bootstrap.service';
import { AuthService } from '../shared/services/auth.service';
import { BridgeRuntimeService } from '../core/bridge-runtime.service';
import { BridgeService } from '../core/bridge.service';

describe('resolveBridgeConfig', () => {
  it('throws, naming the option, with no app id', () => {
    expect(() => resolveBridgeConfig({})).toThrow(/Pass \{ appId \} to provideBridge\(\)/);
    expect(() => resolveBridgeConfig({ appId: '  ' })).toThrow(/No Bridge app id/);
  });

  it('accepts a bare app id string', () => {
    expect(resolveBridgeConfig('app-1').appId).toBe('app-1');
  });

  it('treats an empty value as unset, so the default applies', () => {
    const cfg = resolveBridgeConfig({ appId: 'a', apiBaseUrl: '', hostedUrl: ' ', callbackUrl: '' });
    expect(cfg.apiBaseUrl).toBeUndefined();
    expect(cfg.hostedUrl).toBeUndefined();
    expect(cfg.callbackUrl).toBeUndefined();
  });

  it('derives the hosted pages from the API address on Bridge domains', () => {
    expect(hostedUrlFor('https://api-stage.thebridge.dev')).toBe('https://auth-stage.thebridge.dev');
    expect(hostedUrlFor('https://api.thebridge.dev')).toBe('https://auth.thebridge.dev');
    expect(hostedUrlFor('http://localhost:3300')).toBeUndefined();
    expect(resolveBridgeConfig({ appId: 'a', apiBaseUrl: 'https://api-stage.thebridge.dev' }).hostedUrl).toBe(
      'https://auth-stage.thebridge.dev',
    );
  });

  it('an explicit hostedUrl wins over the derived one', () => {
    const cfg = resolveBridgeConfig({
      appId: 'a',
      apiBaseUrl: 'https://api-stage.thebridge.dev',
      hostedUrl: 'http://localhost:3191',
    });
    expect(cfg.hostedUrl).toBe('http://localhost:3191');
  });

  it('warns in development when the app runs against production, or cannot find its hosted pages', () => {
    const prod = resolveBridgeConfig({ appId: 'a' });
    expect(configWarnings({ appId: 'a' }, prod)[0]).toMatch(/apiBaseUrl is not set/);
    const local = resolveBridgeConfig({ appId: 'a', apiBaseUrl: 'http://localhost:3300' });
    expect(configWarnings({ appId: 'a', apiBaseUrl: 'http://localhost:3300' }, local)[0]).toMatch(/hostedUrl is not set/);
    const stage = resolveBridgeConfig({ appId: 'a', apiBaseUrl: 'https://api-stage.thebridge.dev' });
    expect(configWarnings({ appId: 'a', apiBaseUrl: 'https://api-stage.thebridge.dev' }, stage)).toEqual([]);
  });
});

describe('the bootstrap hands the resolved addresses to auth-core', () => {
  let initBridge: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    initBridge = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { initBridge, maybeRefreshNow: async () => false, markReady: () => {}, getToken: () => null },
        },
        {
          provide: BridgeRuntimeService,
          useValue: { start: () => {}, onTokens: () => () => {}, onAuthorizationChange: () => () => {} },
        },
        { provide: BridgeService, useValue: { initFlags: () => {}, applyAuthContext: () => {} } },
      ],
    });
  });

  it('a stage app signs in on stage hosted pages', async () => {
    await TestBed.inject(BridgeBootstrapService).bootstrap({
      appId: 'app-1',
      apiBaseUrl: 'https://api-stage.thebridge.dev',
    });
    expect(initBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        apiBaseUrl: 'https://api-stage.thebridge.dev',
        hostedUrl: 'https://auth-stage.thebridge.dev',
      }),
    );
    expect(TestBed.inject(BridgeConfigService).getConfig().hostedUrl).toBe('https://auth-stage.thebridge.dev');
  });
});
