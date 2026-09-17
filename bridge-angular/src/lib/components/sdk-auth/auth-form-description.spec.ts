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
import { SignupFormComponent } from './signup-form.component';

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
/**
 * The stubbed `BridgeAuth`. Empty for the render-only cases; the cases further
 * down that have to REACH a later view (MfaSetup's verify/backup steps,
 * PasskeyRequestSetupLink's sent view) fill it in and click their way there
 * rather than poking the component's internal signals — the description is
 * chosen by the step, so a test that sets the step by hand is only asserting
 * that a getter it just primed returns what it was primed with.
 */
let mockApi: Record<string, unknown> = {};

class StubAuthService {
  getBridgeAuth() {
    return mockApi;
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

function fixtureFor<T>(type: new (...args: never[]) => T, inputs: Record<string, unknown> = {}) {
  setup();
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) {
    (fixture.componentInstance as Record<string, unknown>)[k] = v;
  }
  fixture.detectChanges();
  return fixture;
}

function renderWith<T>(type: new (...args: never[]) => T, inputs: Record<string, unknown> = {}) {
  return fixtureFor(type, inputs).nativeElement as HTMLElement;
}

const desc = (el: HTMLElement) => el.querySelector('.bridge-step-desc');
const descs = (el: HTMLElement) => [...el.querySelectorAll('.bridge-step-desc')];
const heading = (el: HTMLElement) => el.querySelector('.bridge-auth-heading');
const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Submit the one `<form>` on screen and let the stubbed promise settle. */
async function submitAndSettle(fixture: { nativeElement: HTMLElement; detectChanges(): void }) {
  const form = fixture.nativeElement.querySelector('form');
  if (!form) throw new Error('No <form> on screen to submit');
  form.dispatchEvent(new Event('submit'));
  await new Promise((r) => setTimeout(r, 5));
  fixture.detectChanges();
}

/** Resolves on the next tick — see selector-i18n.spec.ts for why not sooner. */
function resolvesLater<T>(value: T): () => Promise<T> {
  return () => new Promise((resolve) => setTimeout(() => resolve(value), 0));
}

beforeEach(() => {
  currentConfig = { appId: 'x' };
  mockApi = {};
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

// ---------------------------------------------------------------------------
// The three description paths the table above cannot reach.
//
// Every case in `description: default / override / suppress` renders a
// component in its FIRST view and reads the description off it. That covers the
// components whose description never changes — and quietly skips three places
// where it does:
//
//  - SignupForm has no description in its form view at all. Its one description
//    belongs to the "Check your email" success view, is written inline rather
//    than handed to the wrapper (it has to sit UNDER that view's own heading),
//    and carries `<strong>` markup — a second implementation of the same
//    three-way guard, in a component this file did not even import.
//  - MfaSetup has three descriptions and one wrapper. The table exercises the
//    `phone` one, so a component that returned the phone copy on every step
//    passed.
//  - PasskeyRequestSetupLink's sent view moves the description OUT of the
//    wrapper and into a projected `[description]` element, with
//    `wrapperDescription` returning null so the wrapper does not draw a second
//    one. The table only ever sees the un-sent view, where neither of those is
//    true.
//
// The `undefined` / `null` distinction documented at the top of this file is
// checked on each of them: these are the three re-implementations of that
// guard, and each is a fresh chance to write `??`.

describe('SignupForm success description (TBP-631)', () => {
  const EMAIL = 'ada@example.com';
  const [before, after] = en['signup.successDescription'].split('{email}');

  /** Sign up successfully — the only way to the view that has a description. */
  async function signedUp(inputs: Record<string, unknown> = {}) {
    mockApi = { signup: resolvesLater(undefined) };
    const fixture = fixtureFor(SignupFormComponent as never, { ...inputs });
    (fixture.componentInstance as Record<string, unknown>).email = EMAIL;
    await submitAndSettle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    // Guard: every assertion below is about the success view, and a failed
    // submit would leave us on the form with no description to find — which
    // `expect(desc(el)).toBeNull()` would happily accept.
    expect(squash(el.querySelector('.bridge-success-heading')?.textContent)).toBe(
      en['signup.successHeading'],
    );
    return el;
  }

  it('renders the catalogue sentence with the address in <strong>', async () => {
    const el = await signedUp();
    expect(squash(desc(el)?.textContent)).toBe(`${before}${EMAIL}${after ?? ''}`);
    // The markup is the point: the address is emphasised inside the sentence,
    // which is why this description cannot be a plain wrapper string.
    expect(desc(el)?.querySelector('strong')?.textContent).toBe(EMAIL);
  });

  it('renders a host-supplied description instead, markup and all', async () => {
    const el = await signedUp({ description: 'Mine' });
    expect(squash(desc(el)?.textContent)).toBe('Mine');
    expect(desc(el)?.querySelector('strong')).toBeNull();
    expect(el.textContent).not.toContain(EMAIL);
  });

  for (const suppressed of [null, '']) {
    it(`renders NO paragraph at all when suppressed with ${JSON.stringify(suppressed)}`, async () => {
      const el = await signedUp({ description: suppressed });
      expect(desc(el)).toBeNull();
      // The heading it sits under is untouched — suppressing the subtitle is
      // not suppressing the view.
      expect(squash(el.querySelector('.bridge-success-heading')?.textContent)).toBe(
        en['signup.successHeading'],
      );
    });
  }

  it('renders no description before the signup succeeds', async () => {
    // The form view has none to suppress, which is why the table above could
    // not test this component at all.
    const el = renderWith(SignupFormComponent as never);
    expect(desc(el)).toBeNull();
  });
});

describe('MfaSetup description changes per step (TBP-631)', () => {
  /** Walk the real wizard: phone → verify → backup. */
  async function atStep(step: 'phone' | 'verify' | 'backup', inputs: Record<string, unknown> = {}) {
    mockApi = {
      setupMfa: resolvesLater(undefined),
      confirmMfaSetup: resolvesLater({ backupCode: 'RECOVER-1234' }),
    };
    const fixture = fixtureFor(MfaSetupComponent as never, inputs);
    const instance = fixture.componentInstance as Record<string, unknown>;
    if (step !== 'phone') {
      instance['phoneNumber'] = '+46700000000';
      await submitAndSettle(fixture);
    }
    if (step === 'backup') {
      instance['code'] = '123456';
      await submitAndSettle(fixture);
    }
    return fixture;
  }

  /** Anchors that prove we actually got to the step before reading its copy. */
  const STEP_MARKERS: Record<'phone' | 'verify' | 'backup', string> = {
    phone: '#mfa-phone',
    verify: '#mfa-verify-code',
    backup: '.bridge-backup-code',
  };

  const EXPECTED = {
    phone: en['mfaSetup.phoneDescription'],
    verify: en['mfaSetup.verifyDescription'],
    backup: en['mfaSetup.backupDescription'],
  } as const;

  it('the three catalogue descriptions are actually different strings', () => {
    // Without this the per-step assertions below would still pass against a
    // component that ignores the step, if the catalogue ever collapsed them.
    expect(new Set(Object.values(EXPECTED)).size).toBe(3);
  });

  for (const step of ['phone', 'verify', 'backup'] as const) {
    it(`renders the ${step} description on the ${step} step`, async () => {
      const fixture = await atStep(step);
      try {
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector(STEP_MARKERS[step])).not.toBeNull();
        expect(squash(desc(el)?.textContent)).toBe(EXPECTED[step]);
        // …and not one of the other two. A component that never re-read the
        // step would sit on the phone copy for all three.
        for (const other of Object.values(EXPECTED).filter((d) => d !== EXPECTED[step])) {
          expect(el.textContent).not.toContain(other);
        }
      } finally {
        // ngOnDestroy clears the 60s resend countdown the verify step starts.
        fixture.destroy();
      }
    });

    it(`still suppresses the description with null on the ${step} step`, async () => {
      const fixture = await atStep(step, { description: null });
      try {
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector(STEP_MARKERS[step])).not.toBeNull();
        expect(desc(el)).toBeNull();
        // The step heading is shared across all three and stays put.
        expect(squash(heading(el)?.textContent)).toBe(en['mfaSetup.heading']);
      } finally {
        fixture.destroy();
      }
    });
  }

  it('lets a string override win on a later step too', async () => {
    const fixture = await atStep('backup', { description: 'Mine' });
    try {
      const el = fixture.nativeElement as HTMLElement;
      expect(squash(desc(el)?.textContent)).toBe('Mine');
      expect(el.textContent).not.toContain(en['mfaSetup.backupDescription']);
    } finally {
      fixture.destroy();
    }
  });
});

describe('PasskeyRequestSetupLink sent view (TBP-631)', () => {
  const EMAIL = 'ada@example.com';
  const [before, after] = en['passkey.sentDescription'].split('{email}');

  /** Request the link successfully — the sent view is behind a real call. */
  async function sent(inputs: Record<string, unknown> = {}) {
    mockApi = { sendPasskeySetupLink: resolvesLater(undefined) };
    const fixture = fixtureFor(PasskeyRequestSetupLinkComponent as never, {
      initialEmail: EMAIL,
      ...inputs,
    });
    await submitAndSettle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    // Guard: the un-sent view keeps its own description, so "one paragraph with
    // the wrong text" must not read as a pass.
    expect(squash(heading(el)?.textContent)).toBe(en['passkey.sentHeading']);
    return el;
  }

  it('projects the sent sentence with the address in <strong>', async () => {
    const el = await sent();
    expect(squash(desc(el)?.textContent)).toBe(`${before}${EMAIL}${after ?? ''}`);
    expect(desc(el)?.querySelector('strong')?.textContent).toBe(EMAIL);
    // It is the PROJECTED paragraph, not one the wrapper drew: the wrapper's
    // own `<p>` has no `description` attribute.
    expect(desc(el)?.hasAttribute('description')).toBe(true);
  });

  it('draws exactly one description — the wrapper does not add a second', async () => {
    // `wrapperDescription` returns null in this view precisely so the sentence
    // is not printed twice, once with markup and once without. Projecting into
    // `[description]` does not suppress the wrapper's own paragraph; only that
    // null does.
    const el = await sent();
    expect(descs(el)).toHaveLength(1);
    expect(el.textContent?.indexOf(before)).toBe(el.textContent?.lastIndexOf(before));
  });

  it('renders a host-supplied description instead, and still only one', async () => {
    const el = await sent({ description: 'Mine' });
    expect(descs(el)).toHaveLength(1);
    expect(squash(desc(el)?.textContent)).toBe('Mine');
    expect(el.textContent).not.toContain(before);
  });

  for (const suppressed of [null, '']) {
    it(`renders NO paragraph at all when suppressed with ${JSON.stringify(suppressed)}`, async () => {
      const el = await sent({ description: suppressed });
      expect(descs(el)).toHaveLength(0);
      expect(squash(heading(el)?.textContent)).toBe(en['passkey.sentHeading']);
    });
  }
});
