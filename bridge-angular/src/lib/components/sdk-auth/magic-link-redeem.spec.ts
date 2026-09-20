import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, en } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { MagicLinkComponent } from './magic-link.component';

/**
 * TBP-682 — MagicLink must redeem the emailed token, not only send it.
 *
 * auth-core posts `successUrl` = the page the request was made from, and Bridge
 * emails `{successUrl}?bridge_magic_link_token=<token>`. login-form has always
 * redeemed that token in `ngOnInit`; magic-link only ever sent. So a request
 * made from a route that mounts `<bridge-magic-link>` emailed a link back to
 * that same route, where nothing redeemed it: the page rendered, the token sat
 * in the address bar, and the user stayed signed out.
 *
 * Driven through the real component, like login-origin-error.spec.ts: a stubbed
 * BridgeAuth is the only seam, and the address bar is jsdom's own.
 */

let bridgeAuth: Record<string, ReturnType<typeof vi.fn>>;

class StubAuthService {
  readonly authState = signal<string>('unauthenticated');
  readonly tenantUsers = signal<unknown[]>([]);
  readonly appConfig = signal<unknown>(null);
  readonly profile = signal<unknown>(null);
  getBridgeAuth() {
    return bridgeAuth;
  }
  async ensureAppConfig() {
    /* no-op */
  }
}

/** Serve the page from `pathAndQuery` — the URL the emailed link lands on. */
function servePage(pathAndQuery: string): void {
  window.history.replaceState({}, '', pathAndQuery);
}

/** Create the component; the first `detectChanges` is what runs `ngOnInit`. */
function mount(): ComponentFixture<MagicLinkComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useClass: StubAuthService },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'tbp-682-test' }) } },
    ],
  });
  const fixture = TestBed.createComponent(MagicLinkComponent);
  fixture.detectChanges();
  return fixture;
}

/** Let the redeem promise and its `.finally` settle, and change detection run. */
async function settle(f: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
  }
}

const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const alertText = (f: ComponentFixture<unknown>) =>
  (el(f).querySelector('[data-bridge-alert]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const emailField = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLInputElement>('#magic-email');
const submitButton = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLButtonElement>('button[type="submit"]');

beforeEach(() => {
  bridgeAuth = {};
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('MagicLink redeems the emailed token on init (TBP-682)', () => {
  it('redeems the token in the URL and strips it from the address bar', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=tok-1&utm_source=email');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => ({}));

    const f = mount();
    await settle(f);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledTimes(1);
    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledWith('tok-1');

    // The token is gone, the app's own query survives — a reload or a shared
    // link cannot replay it.
    expect(window.location.search).toBe('?utm_source=email');
    expect(window.location.pathname).toBe('/auth/magic-link');
    expect(alertText(f)).toBe('');
  });

  it('strips the whole query when the token was the only parameter', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=tok-2');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => ({}));

    const f = mount();
    await settle(f);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/auth/magic-link');
  });

  it('strips the token BEFORE redeeming, not after', async () => {
    // The strip is what makes the redeem un-replayable, so it has to happen on
    // the way in, not in a `.then`. Asserted by reading the address bar from
    // inside the stub: by the time auth-core is called, the token is gone.
    servePage('/auth/magic-link?bridge_magic_link_token=tok-3');
    let searchDuringRedeem = 'unset';
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => {
      searchDuringRedeem = window.location.search;
      return {};
    });

    const f = mount();
    await settle(f);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledTimes(1);
    expect(searchDuringRedeem).toBe('');
  });

  it('does nothing when there is no token — the send form renders as before', async () => {
    servePage('/auth/magic-link');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => ({}));

    const f = mount();
    await settle(f);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).not.toHaveBeenCalled();
    expect(emailField(f)).not.toBeNull();
    expect(submitButton(f)!.textContent).toContain(en['magicLink.submit']);
    expect(alertText(f)).toBe('');
  });

  it('leaves an unrelated query untouched when there is no token', async () => {
    servePage('/auth/magic-link?utm_source=email');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => ({}));

    const f = mount();
    await settle(f);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?utm_source=email');
  });

  it('a second component on the same page finds no token left to replay', async () => {
    // Angular has no StrictMode double-invoke, but the same invariant matters:
    // the strip is what makes a re-init (a re-navigation to the route, a second
    // instance) a no-op rather than a second redeem of a spent token.
    servePage('/auth/magic-link?bridge_magic_link_token=tok-4');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => ({}));

    const first = mount();
    await settle(first);
    const second = mount();
    await settle(second);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledTimes(1);
    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledWith('tok-4');
  });
});

describe('MagicLink surfaces a refused redeem (TBP-682)', () => {
  it('shows the error, emits error, and leaves the loading state', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=expired');
    const refusal = new HttpError('This magic link has expired.', 401, {
      message: 'This magic link has expired.',
    });
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => {
      throw refusal;
    });

    const f = mount();
    const emitted: Error[] = [];
    f.componentInstance.error.subscribe((e: Error) => emitted.push(e));
    await settle(f);

    expect(alertText(f)).toBe('This magic link has expired.');
    expect(emitted).toEqual([refusal]);

    // Loading is over: the form is usable again, so the user can request a
    // fresh link from the same screen.
    expect(submitButton(f)!.textContent).toContain(en['magicLink.submit']);
    expect(emailField(f)!.disabled).toBe(false);
  });

  it('falls back to the magicLink.error.auth copy when the failure carries no message', async () => {
    servePage('/auth/magic-link?bridge_magic_link_token=nope');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => {
      throw new Error('');
    });

    const f = mount();
    const emitted: Error[] = [];
    f.componentInstance.error.subscribe((e: Error) => emitted.push(e));
    await settle(f);

    expect(alertText(f)).toBe(en['magicLink.error.auth']);
    expect(emitted).toHaveLength(1);
  });
});
