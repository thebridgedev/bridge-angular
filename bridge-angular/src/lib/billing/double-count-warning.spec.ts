/**
 * TBP-515 (svelte TBP-697) — in development, a metric counted by both the
 * backend (`X-Bridge-Usage-Counted`) and the page (`bridge.usage`) is warned
 * about once. Revert-proof: origin/main had no such warning.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../shared/services/auth.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { bridgeFetch, bridgeInterceptor, setBridgeFetchAuth } from './bridge-http';
import { __resetDoubleCountWarning } from './double-count-warning';

const usage = { report: vi.fn(), set: vi.fn(async () => {}), getQueueStatus: vi.fn(async () => ({})) };
const auth = {
  tokens: signal({ accessToken: 't', refreshToken: 'r', idToken: 'i' }),
  getToken: () => ({ accessToken: 't', refreshToken: 'r', idToken: 'i' }),
  refreshToken: async () => null,
  getBridgeAuth: () => ({ usage }),
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetDoubleCountWarning();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([bridgeInterceptor])),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
    ],
  });
  TestBed.inject(BridgeConfigService).initConfig({ appId: 'a', apiBaseUrl: 'https://api.thebridge.dev' });
});

afterEach(() => {
  warn.mockRestore();
  vi.unstubAllGlobals();
  setBridgeFetchAuth(null);
});

function countedWarnings(): unknown[][] {
  return warn.mock.calls.filter((c) => String(c[0]).includes('is counted twice'));
}

describe('the counted-twice warning (development only)', () => {
  it('warns once when the backend and the page both count a metric', async () => {
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const call = firstValueFrom(http.post('/api/exports', {}));
    ctrl.expectOne('/api/exports').flush({}, { headers: { 'X-Bridge-Usage-Counted': 'exports' } });
    await call;
    expect(countedWarnings()).toHaveLength(0);

    const bridge = TestBed.inject(BridgeService);
    bridge.usage.report('exports');
    bridge.usage.report('exports');
    expect(countedWarnings()).toHaveLength(1);
    expect(String(countedWarnings()[0][0])).toContain("'exports' is counted twice");
  });

  it('stays quiet for metrics counted on one side only', async () => {
    const bridge = TestBed.inject(BridgeService);
    bridge.usage.report('ai_completions');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'X-Bridge-Usage-Counted': 'tickets' } })));
    setBridgeFetchAuth(auth as unknown as AuthService);
    await bridgeFetch('/api/tickets', { method: 'POST' });
    expect(countedWarnings()).toHaveLength(0);
    await bridge.usage.set('tickets', 3);
    expect(countedWarnings()).toHaveLength(1);
  });
});
