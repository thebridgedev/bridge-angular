import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal, type WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, en } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { LoginFormComponent } from './login-form.component';
import { MfaChallengeComponent } from './mfa-challenge.component';
import { _resetOriginReports } from './shared/auth-error';

/**
 * TBP-669 — LoginForm must show a sign-in failure instead of "Signing in…".
 *
 * On stage, a magic-link sign-in from an origin missing from the app's allowed
 * origins was accepted, then the token exchange answered 403 "Origin not
 * allowed". The auth state stayed at `credentials-validated` (the published
 * auth-core does not reset it), and LoginForm renders every
 * non-`unauthenticated` state as the settling spinner — so the error it had
 * caught never rendered.
 *
 * Driven through the real component: a stubbed BridgeAuth moves the auth state
 * the way auth-core does and then rejects, exactly as on stage.
 */

const ORIGIN = window.location.origin;
const MSG = `This app's allowed origins in Bridge don't include ${ORIGIN} — add it in Bridge admin under Authentication → Security → Allowed Origins.`;
const originRefusal = () =>
  new HttpError('Origin not allowed', 403, { message: 'Origin not allowed', error: 'Forbidden', statusCode: 403 });

let authState: WritableSignal<string>;
let bridgeAuth: Record<string, ReturnType<typeof vi.fn>>;

class StubAuthService {
  readonly authState = authState;
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

function mount(state = 'unauthenticated'): ComponentFixture<LoginFormComponent> {
  authState = signal<string>(state);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useClass: StubAuthService },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'tbp-669-test' }) } },
    ],
  });
  const fixture = TestBed.createComponent(LoginFormComponent);
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const settling = (f: ComponentFixture<unknown>) => el(f).querySelector('[data-bridge-auth-settling]');
const passwordField = (f: ComponentFixture<unknown>) => el(f).querySelector('input[type="password"]');
const text = (f: ComponentFixture<unknown>) => (el(f).textContent ?? '').replace(/\s+/g, ' ').trim();

async function settle(f: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
  }
}

/** Type credentials and submit the password form. */
async function signInWithPassword(f: ComponentFixture<LoginFormComponent>): Promise<void> {
  const cmp = f.componentInstance;
  cmp.email = 'dev@example.com';
  cmp.password = 'pw';
  await cmp.handleSubmit();
  await settle(f);
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  _resetOriginReports();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  bridgeAuth = {};
});
afterEach(() => {
  consoleError.mockRestore();
  window.history.replaceState({}, '', '/');
});

describe('LoginForm shows a failed token exchange (TBP-669)', () => {
  it('magic link refused at the token exchange: the error, not "Signing in…", on the same screen', async () => {
    window.history.replaceState({}, '', '/auth/login?bridge_magic_link_token=tok');
    bridgeAuth['authenticateWithMagicLinkToken'] = vi.fn(async () => {
      // auth-core validates the link, then `token/direct` answers 403 — and the
      // published auth-core leaves the state where the exchange started.
      authState.set('credentials-validated');
      throw originRefusal();
    });
    const f = mount();
    await settle(f);

    expect(bridgeAuth['authenticateWithMagicLinkToken']).toHaveBeenCalledWith('tok');
    expect(authState()).toBe('credentials-validated');
    expect(settling(f)).toBeNull();
    expect(text(f)).toContain(MSG);
    expect(el(f).querySelector('[data-bridge-alert]')).not.toBeNull();
    // The user can try again from the same screen.
    expect(passwordField(f)).not.toBeNull();
    // One console line naming the origin, with the docs link.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain(ORIGIN);
  });

  it('password sign-in refused: the origin fix replaces the bare "Origin not allowed"', async () => {
    bridgeAuth['authenticate'] = vi.fn(async () => {
      throw originRefusal();
    });
    const f = mount();
    await signInWithPassword(f);
    expect(text(f)).toContain(MSG);
    expect(text(f)).not.toMatch(/(^|[^—] )Origin not allowed/);
    // Loading is over: the submit button is back to its idle label.
    expect(el(f).querySelector('button[type="submit"]')!.textContent).toContain(en['login.submit']);
  });

  it('other 403s keep their own message', async () => {
    bridgeAuth['authenticate'] = vi.fn(async () => {
      throw new HttpError('User is disabled', 403, { message: 'User is disabled' });
    });
    const f = mount();
    await signInWithPassword(f);
    expect(text(f)).toContain('User is disabled');
    expect(text(f)).not.toContain('allowed origins');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('a stale error from an earlier attempt does not hijack a later sign-in (TBP-635 still holds)', async () => {
    // A wrong password, then a sign-in (e.g. passkey) that moves the state on.
    bridgeAuth['authenticate'] = vi.fn(async () => {
      throw new HttpError('Invalid email or password.', 401);
    });
    const f = mount();
    await signInWithPassword(f);
    expect(text(f)).toContain('Invalid email or password.');

    authState.set('credentials-validated');
    f.detectChanges();
    expect(settling(f)).not.toBeNull();
    expect(passwordField(f)).toBeNull();
  });

  it('an origin refusal raised inside MFA reaches LoginForm once the sign-in ends', async () => {
    const f = mount('mfa-required');
    const emitted: Error[] = [];
    f.componentInstance.error.subscribe((e: Error) => emitted.push(e));
    const mfa = f.debugElement.query(By.directive(MfaChallengeComponent));
    expect(mfa).not.toBeNull();
    const err = originRefusal();
    mfa.componentInstance.error.emit(err);
    // auth-core ends the sign-in, which unmounts the MFA step that caught it.
    authState.set('unauthenticated');
    f.detectChanges();

    expect(text(f)).toContain(MSG);
    expect(passwordField(f)).not.toBeNull();
    expect(emitted).toEqual([err]);
  });

  it('other MFA errors stay with the MFA step', async () => {
    const f = mount('mfa-required');
    const mfa = f.debugElement.query(By.directive(MfaChallengeComponent));
    mfa.componentInstance.error.emit(new HttpError('Invalid code', 400));
    authState.set('unauthenticated');
    f.detectChanges();
    expect(text(f)).not.toContain('Invalid code');
  });
});
