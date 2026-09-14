import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en, sv } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { LoginFormComponent } from './login-form.component';

/**
 * TBP-635 — LoginForm must never draw the credentials form to somebody who has
 * already authenticated.
 *
 * The auth-state chain named `mfa-required`, `mfa-setup-required` and
 * `tenant-selection`, and let everything else fall through to the credentials
 * form. `authenticated` and `credentials-validated` are also everything else,
 * so between the token exchange resolving and the host app's router landing —
 * LoginForm emits `login` and deliberately does not navigate — the component
 * showed a password field to a user who had just typed their password
 * correctly. That reads as a refusal.
 *
 * The load-bearing assertion is the EXHAUSTIVE one: every `AuthState`, read out
 * of auth-core's shipped type declaration rather than hardcoded, and exactly one
 * of them may render a password field. The bug was an unhandled branch, so a
 * seventh state added to auth-core tomorrow is covered the moment it exists.
 */

/**
 * Deliberately not a literal list: a hardcoded one would still say six when
 * auth-core says seven. Parsing throws rather than returning a short list, so a
 * refactor that moves the type fails this suite loudly instead of quietly
 * testing fewer states.
 */
function authStates(): string[] {
  const candidates = [
    path.resolve('node_modules/@nebulr-group/bridge-auth-core/dist/types.d.ts'),
    path.resolve('../node_modules/@nebulr-group/bridge-auth-core/dist/types.d.ts'),
  ];
  const dts = candidates.find((c) => fs.existsSync(c));
  if (!dts) throw new Error(`auth-core types.d.ts not found in:\n  ${candidates.join('\n  ')}`);
  const match = fs.readFileSync(dts, 'utf8').match(/export type AuthState\s*=([^;]+);/);
  if (!match) throw new Error('Could not find `export type AuthState` in auth-core types.d.ts.');
  const states = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (states.length < 2) throw new Error(`Parsed only ${states.length} AuthState members.`);
  return states;
}

const STATES = authStates();

let mockConfig: Record<string, unknown> = { appId: 'x' };
let mockAuthState = signal<string>('unauthenticated');
let mockTenantUsers = signal<unknown[]>([]);

class StubAuthService {
  readonly authState = mockAuthState;
  readonly tenantUsers = mockTenantUsers;
  readonly appConfig = signal<unknown>(null);
  readonly profile = signal<unknown>(null);
  getBridgeAuth() {
    return {};
  }
  async ensureAppConfig() {
    /* no-op */
  }
}

function renderAt(state: string, inputs: Record<string, unknown> = {}) {
  mockAuthState = signal<string>(state);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useClass: StubAuthService },
      { provide: BridgeConfigService, useValue: { getConfig: () => mockConfig } },
    ],
  });
  const fixture = TestBed.createComponent(LoginFormComponent);
  for (const [k, v] of Object.entries(inputs)) {
    (fixture.componentInstance as Record<string, unknown>)[k] = v;
  }
  fixture.detectChanges();
  return fixture;
}

const el = (f: { nativeElement: HTMLElement }) => f.nativeElement as HTMLElement;
const passwordField = (f: { nativeElement: HTMLElement }) =>
  el(f).querySelector('input[type="password"]');
const settlingCard = (f: { nativeElement: HTMLElement }) =>
  el(f).querySelector('[data-bridge-auth-settling]');
const text = (f: { nativeElement: HTMLElement }) =>
  (el(f).textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  mockConfig = { appId: 'x' };
  mockTenantUsers = signal<unknown[]>([]);
});

describe('AuthState coverage (TBP-635)', () => {
  it('reads the real state list out of the shipped auth-core types', () => {
    expect(STATES).toContain('unauthenticated');
    expect(STATES).toContain('authenticated');
    expect(STATES).toContain('credentials-validated');
    expect(STATES.length).toBeGreaterThanOrEqual(6);
  });
});

describe('LoginForm never shows the credentials form post-auth (TBP-635)', () => {
  it('renders a password field for `unauthenticated` and for nothing else', () => {
    const withPassword: string[] = [];
    for (const state of STATES) {
      if (passwordField(renderAt(state))) withPassword.push(state);
    }
    // Both directions. Asserting only "authenticated has no password field"
    // would pass for a component that rendered nothing at all, ever.
    expect(withPassword).toEqual(['unauthenticated']);
  });

  for (const state of ['authenticated', 'credentials-validated']) {
    it(`shows the settling card at "${state}"`, () => {
      const fixture = renderAt(state);
      expect(settlingCard(fixture)).not.toBeNull();
      expect(passwordField(fixture)).toBeNull();
      // Not a blank card: an empty box during a pause is its own bad message.
      expect(text(fixture)).toContain(en['login.submitting']);
    });
  }

  it('translates the waiting copy', () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const fixture = renderAt('authenticated');
    expect(text(fixture)).toContain(sv['login.submitting']);
    expect(text(fixture)).not.toContain(en['login.submitting']);
  });

  it('suppresses the heading while settling, so no stale "Log in" survives', () => {
    const fixture = renderAt('authenticated', { heading: 'Log in to NorthWhistle' });
    expect(text(fixture)).not.toContain('Log in to NorthWhistle');
    expect(settlingCard(fixture)).not.toBeNull();
  });

  it('still hands the delegated states to their own components', () => {
    // The fix must not have swallowed the branches that already worked — an
    // over-eager `!== unauthenticated` placed above them would do exactly that.
    expect(el(renderAt('tenant-selection')).querySelector('.bridge-tenant-list')).not.toBeNull();
    expect(text(renderAt('mfa-required'))).toContain(en['mfa.challengeHeading']);
    expect(text(renderAt('mfa-setup-required'))).toContain(en['mfaSetup.heading']);
  });

  it('leaves the unauthenticated step machine alone', () => {
    const fixture = renderAt('unauthenticated');
    expect(passwordField(fixture)).not.toBeNull();
    expect(settlingCard(fixture)).toBeNull();
  });
});

describe('login output is unchanged (TBP-635)', () => {
  it('emits once, and only once the state reaches `authenticated`', () => {
    // The tempting wrong fix is to emit earlier so the consumer navigates
    // sooner — which would fire it before the session is real.
    mockAuthState = signal<string>('unauthenticated');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useClass: StubAuthService },
        { provide: BridgeConfigService, useValue: { getConfig: () => mockConfig } },
      ],
    });
    const fixture = TestBed.createComponent(LoginFormComponent);
    let calls = 0;
    fixture.componentInstance.login.subscribe(() => {
      calls += 1;
    });
    fixture.detectChanges();
    expect(calls).toBe(0);

    mockAuthState.set('credentials-validated');
    fixture.detectChanges();
    expect(calls).toBe(0);

    mockAuthState.set('authenticated');
    fixture.detectChanges();
    expect(calls).toBe(1);

    // A re-render at the same state must not emit again.
    fixture.detectChanges();
    expect(calls).toBe(1);
  });
});
