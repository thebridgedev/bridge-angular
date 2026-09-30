import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { LoginFormComponent } from './login-form.component';
import { PasskeyLoginComponent } from './passkey-login.component';
import { PasskeyRequestSetupLinkComponent } from './passkey-request-setup-link.component';
import { PasskeySetupComponent } from './passkey-setup.component';

/**
 * TBP-744 / TBP-515 (passkeys) — the Angular passkey components run the real
 * WebAuthn ceremony against auth-core's API. Port of bridge-react's
 * `test/passkeys.test.tsx` (react PRs #39 / #41).
 *
 * Found on the stage check of 0.8.0-beta.1: all three components called
 * auth-core methods that do not exist (`registerPasskeyWithToken`,
 * `sendPasskeySetupLink`) or skipped the authenticator
 * (`authenticateWithPasskey()` with no answer), so an emailed setup link always
 * failed and a passkey sign-in never reached an authenticator. And with no
 * passkey on the device, LoginForm sent the person to `/auth/setup-passkey`,
 * which `bridgeAuthRoutes()` does not serve.
 *
 * Revert-proof: on origin/main (e9bd6c7) every test here fails — the calls are
 * never made, the setup shows "Passkey setup failed.", the button renders in a
 * browser without WebAuthn, and LoginForm never shows an email field.
 *
 * The authenticator is `window.__simpleWebAuthn`, the same hook bridge-svelte's
 * e2e suite uses for its virtual authenticator.
 */

const w = window as unknown as Record<string, unknown>;
let calls: string[];
let bridgeAuth: Record<string, (...args: any[]) => Promise<unknown>>;

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

function mount<T>(cmp: Type<T>, inputs: Record<string, unknown> = {}): ComponentFixture<T> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useClass: StubAuthService },
      { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'tbp-744-test' }) } },
    ],
  });
  const f = TestBed.createComponent(cmp);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  f.detectChanges();
  return f;
}

async function settle(f: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
  }
}

const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const text = (f: ComponentFixture<unknown>) => (el(f).textContent ?? '').replace(/\s+/g, ' ').trim();
const buttonWithText = (f: ComponentFixture<unknown>, label: string) =>
  [...el(f).querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement;

/** Type into an ngModel field and submit its form, the way a person does. */
async function submitEmail(f: ComponentFixture<unknown>, input: HTMLInputElement, email: string) {
  await settle(f); // ngModel writes its initial value asynchronously
  input.value = email;
  input.dispatchEvent(new Event('input'));
  await settle(f);
  input.closest('form')!.dispatchEvent(new Event('submit'));
  await settle(f);
}

beforeEach(() => {
  calls = [];
  w.PublicKeyCredential = function PublicKeyCredential() {};
  w.__simpleWebAuthn = {
    startAuthentication: async ({ optionsJSON }: { optionsJSON: { challenge: string } }) => {
      calls.push(`authenticator:sign:${optionsJSON.challenge}`);
      return { id: 'assertion-1' };
    },
    startRegistration: async ({ optionsJSON }: { optionsJSON: { challenge: string } }) => {
      calls.push(`authenticator:create:${optionsJSON.challenge}`);
      return { id: 'credential-1' };
    },
  };
  bridgeAuth = {
    getPasskeyAuthOptions: async () => {
      calls.push('bridge:auth-options');
      return { challenge: 'login-challenge' };
    },
    authenticateWithPasskey: async (response: { id: string }) => {
      calls.push(`bridge:authenticate:${response?.id}`);
      return {};
    },
    getPasskeyRegistrationOptions: async (token: string) => {
      calls.push(`bridge:registration-options:${token}`);
      return { challenge: 'setup-challenge' };
    },
    verifyPasskeyRegistration: async (credential: { id: string }, token: string) => {
      calls.push(`bridge:verify:${credential?.id}:${token}`);
      return { verified: true };
    },
    requestPasskeySetupLink: async (email: string) => {
      calls.push(`bridge:setup-link:${email}`);
      return { success: true };
    },
  };
});

afterEach(() => {
  delete w.PublicKeyCredential;
  delete w.__simpleWebAuthn;
  window.history.replaceState({}, '', '/');
});

describe('passkeys (TBP-744)', () => {
  it('sign-in: options from Bridge → the authenticator → its answer back to Bridge', async () => {
    const f = mount(PasskeyLoginComponent);
    const signedIn = vi.fn();
    f.componentInstance.login.subscribe(signedIn);
    el(f).querySelector<HTMLButtonElement>('[data-bridge-passkey-login]')!.click();
    await settle(f);
    expect(calls).toEqual(['bridge:auth-options', 'authenticator:sign:login-challenge', 'bridge:authenticate:assertion-1']);
    expect(signedIn).toHaveBeenCalledTimes(1);
  });

  it('sign-in: the button is hidden where the browser has no passkeys', () => {
    delete w.PublicKeyCredential;
    const f = mount(PasskeyLoginComponent);
    expect(el(f).querySelector('[data-bridge-passkey-login]')).toBeNull();
  });

  it('setup from an emailed link: registration options for the token → a new credential → verified', async () => {
    const f = mount(PasskeySetupComponent, { token: 'tok-9' });
    buttonWithText(f, en['passkey.setupSubmit']).click();
    await settle(f);
    expect(calls).toEqual([
      'bridge:registration-options:tok-9',
      'authenticator:create:setup-challenge',
      'bridge:verify:credential-1:tok-9',
    ]);
    expect(text(f)).toContain(en['passkey.setupSuccessDescription']);
  });

  it('setup: an expired link says so and offers a new one', async () => {
    bridgeAuth.getPasskeyRegistrationOptions = async () => {
      throw new Error('Token expired');
    };
    const f = mount(PasskeySetupComponent, { token: 'old' });
    const expired = vi.fn();
    f.componentInstance.expired.subscribe(expired);
    buttonWithText(f, en['passkey.setupSubmit']).click();
    await settle(f);
    expect(text(f)).toContain(en['passkey.error.expired']);
    buttonWithText(f, en['passkey.requestNewLink']).click();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  // Found on stage with the published 0.8.0-beta.1 (react #41, same bug here):
  // "no passkey on this device" navigated to `/auth/setup-passkey`, a page
  // `bridgeAuthRoutes()` does not serve.
  it('LoginForm: no passkey on this device asks for the email in place, not a missing page', async () => {
    (w.__simpleWebAuthn as Record<string, unknown>).startAuthentication = async () => {
      throw Object.assign(new Error('none'), { name: 'NotAllowedError' });
    };
    const before = window.location.href;
    const f = mount(LoginFormComponent, { showPasskeys: true });
    el(f).querySelector<HTMLButtonElement>('[data-bridge-passkey-login]')!.click();
    await settle(f);
    const emailField = el(f).querySelector<HTMLInputElement>('#passkey-request-email');
    expect(emailField).not.toBeNull();
    expect(el(f).querySelector('#login-email')).toBeNull();
    expect(window.location.href).toBe(before);
    await submitEmail(f, emailField!, 'ada@example.com');
    expect(calls).toContain('bridge:setup-link:ada@example.com');
  });

  it('requesting a setup link calls auth-core’s requestPasskeySetupLink', async () => {
    const f = mount(PasskeyRequestSetupLinkComponent);
    await submitEmail(f, el(f).querySelector<HTMLInputElement>('input[type="email"]')!, 'ada@example.com');
    expect(calls).toEqual(['bridge:setup-link:ada@example.com']);
  });
});
