import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { en, sv } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { MagicLinkComponent } from './magic-link.component';
import { ForgotPasswordComponent } from './forgot-password.component';
import { MfaSetupComponent } from './mfa-setup.component';
import { PasskeySetupComponent } from './passkey-setup.component';
import { PasskeyRequestSetupLinkComponent } from './passkey-request-setup-link.component';

/**
 * TBP-631 (description suppression) and TBP-630 (translation), against the real
 * components.
 *
 * The distinction carrying the whole feature is `undefined` vs `null`:
 * `undefined` means "not overridden, use the catalogue", `null` means "the host
 * suppressed this". Collapsing them to `description ?? builtIn` would silently
 * ignore an explicit null, which IS the feature — so every component is checked
 * on all three states.
 */

let currentConfig: Record<string, unknown> = { appId: 'x' };

class StubAuthService {
  getBridgeAuth() {
    return {};
  }
  async ensureAppConfig() {
    /* no-op */
  }
}

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useClass: StubAuthService },
      {
        provide: BridgeConfigService,
        useValue: { getConfig: () => currentConfig },
      },
    ],
  });
}

function renderWith<T>(type: new (...args: never[]) => T, inputs: Record<string, unknown> = {}) {
  setup();
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) {
    (fixture.componentInstance as Record<string, unknown>)[k] = v;
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const desc = (el: HTMLElement) => el.querySelector('.bridge-step-desc');
const heading = (el: HTMLElement) => el.querySelector('.bridge-auth-heading');

beforeEach(() => {
  currentConfig = { appId: 'x' };
});

describe('description: default / override / suppress', () => {
  const cases: Array<[string, new (...args: never[]) => unknown, string, Record<string, unknown>]> = [
    ['MagicLink', MagicLinkComponent, en['magicLink.description'], {}],
    ['ForgotPassword', ForgotPasswordComponent, en['forgot.description'], {}],
    ['MfaSetup', MfaSetupComponent, en['mfaSetup.phoneDescription'], {}],
    ['PasskeySetup', PasskeySetupComponent, en['passkey.setupClickPrompt'], { token: 't' }],
    [
      'PasskeyRequestSetupLink',
      PasskeyRequestSetupLinkComponent,
      en['passkey.requestDescription'],
      {},
    ],
  ];

  for (const [name, type, expected, inputs] of cases) {
    it(`${name} renders the catalogue description by default`, () => {
      const el = renderWith(type as never, inputs);
      expect(desc(el)?.textContent?.trim()).toBe(expected);
    });

    it(`${name} renders a host-supplied description instead`, () => {
      const el = renderWith(type as never, { ...inputs, description: 'Mine' });
      expect(desc(el)?.textContent?.trim()).toBe('Mine');
    });

    it(`${name} renders NO paragraph at all when suppressed with null`, () => {
      const el = renderWith(type as never, { ...inputs, description: null });
      // Not an empty <p> — an empty paragraph still holds vertical space, which
      // is the visible half of the bug.
      expect(desc(el)).toBeNull();
    });
  }

  it('suppressing the description leaves the heading alone', () => {
    const el = renderWith(MagicLinkComponent as never, { description: null });
    expect(desc(el)).toBeNull();
    expect(heading(el)?.textContent?.trim()).toBe(en['magicLink.heading']);
  });

  it('suppressing the heading leaves the description alone', () => {
    const el = renderWith(MagicLinkComponent as never, { heading: null });
    expect(heading(el)).toBeNull();
    expect(desc(el)?.textContent?.trim()).toBe(en['magicLink.description']);
  });
});

describe('locale resolution', () => {
  it('renders Swedish when config asks for it', () => {
    currentConfig = { appId: 'x', locale: 'sv' };
    const el = renderWith(MagicLinkComponent as never);
    expect(desc(el)?.textContent?.trim()).toBe(sv['magicLink.description']);
  });

  it('resolves a region variant to its base language', () => {
    // sv-SE falling back to English is the bug, not the behaviour.
    currentConfig = { appId: 'x', locale: 'sv-SE' };
    const el = renderWith(MagicLinkComponent as never);
    expect(desc(el)?.textContent?.trim()).toBe(sv['magicLink.description']);
  });

  it('falls back to English for an unknown locale rather than throwing', () => {
    currentConfig = { appId: 'x', locale: 'klingon' };
    const el = renderWith(MagicLinkComponent as never);
    expect(desc(el)?.textContent?.trim()).toBe(en['magicLink.description']);
  });

  it('renders English when nothing is configured — not a breaking change', () => {
    const el = renderWith(MagicLinkComponent as never);
    expect(heading(el)?.textContent?.trim()).toBe(en['magicLink.heading']);
  });

  it('lets a per-component messages input beat the locale', () => {
    currentConfig = { appId: 'x', locale: 'sv' };
    const el = renderWith(MagicLinkComponent as never, {
      messages: { 'magicLink.heading': 'Just this screen' },
    });
    expect(heading(el)?.textContent?.trim()).toBe('Just this screen');
    // …and leaves every other key on the configured locale.
    expect(desc(el)?.textContent?.trim()).toBe(sv['magicLink.description']);
  });

  it('lets config messages override the locale, and the input override config', () => {
    currentConfig = { appId: 'x', locale: 'sv', messages: { 'magicLink.heading': 'From config' } };
    expect(heading(renderWith(MagicLinkComponent as never))?.textContent?.trim()).toBe(
      'From config',
    );
    expect(
      heading(
        renderWith(MagicLinkComponent as never, {
          messages: { 'magicLink.heading': 'From input' },
        }),
      )?.textContent?.trim(),
    ).toBe('From input');
  });

  it('never renders a raw key', () => {
    // If the catalogue is wrong the user sees the wrong language, which is a
    // defect. If it rendered keys they would see `magicLink.heading` on screen,
    // which is a broken product.
    currentConfig = { appId: 'x', locale: 'sv' };
    const el = renderWith(MagicLinkComponent as never);
    expect(el.textContent).not.toContain('magicLink.');
  });

  it('falls back to English when config is not initialised at all', () => {
    // A login form that throws because nobody called provideBridge() is a worse
    // failure than one rendered in English.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useClass: StubAuthService },
        {
          provide: BridgeConfigService,
          useValue: {
            getConfig: () => {
              throw new Error('Config has not been initialized.');
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MagicLinkComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(heading(el)?.textContent?.trim()).toBe(en['magicLink.heading']);
  });
});
