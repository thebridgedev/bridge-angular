import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { en, sv } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';
import { TranslatableComponent } from '../../i18n/translator';
import { TenantSelectorComponent } from './tenant-selector.component';
import { WorkspaceSelectorComponent } from './workspace-selector.component';
import { SsoButtonComponent } from './sso-button.component';
import { LoginFormComponent } from './login-form.component';

/**
 * TenantSelector, WorkspaceSelector and SsoButton were missed by TBP-630's
 * original i18n sweep and again by the TBP-633 port, so they still rendered
 * English after everything around them had been translated. TenantSelector is
 * the one that stings: it renders MID-LOGIN on the multi-workspace path,
 * putting one English screen between a translated login form and a translated
 * app (TBP-634).
 *
 * Every error string below is produced by driving the REAL failure path — a
 * click on a stubbed API that rejects — not by seeding component state. A
 * component can hold the right key in its template and still assign an English
 * literal in its catch block, and only the second is what a user in Swedish
 * actually hits.
 */

let mockConfig: Record<string, unknown> = { appId: 'x' };
let mockTenantUsers = signal<unknown[]>([]);
let mockApi: Record<string, unknown> = {};

const TENANT = {
  id: 'tu-1',
  fullName: 'Ada Lovelace',
  tenant: { id: 't-1', name: 'Acme', logo: null },
};

const WORKSPACE = {
  id: 'ws-1',
  fullName: 'Ada Lovelace',
  tenant: { id: 't-1', name: 'Acme', logo: null },
};

const CONNECTION = { id: 'google', type: 'google', name: 'Google' };

/**
 * A stub that rejects on the next tick rather than returning an
 * already-rejected promise.
 *
 * zone.js cannot see the handler that a native `await` attaches to a promise
 * that is ALREADY rejected, so it reports the rejection as unhandled even
 * though the component catches it — seven "Uncaught Exception" reports and a
 * non-zero exit, with every assertion green. Rejecting a tick later lets the
 * handler attach first. It is also the more honest stub: a network call does
 * not fail before it is called.
 */
function rejectsLater(error: Error): () => Promise<never> {
  return () => new Promise((_, reject) => setTimeout(() => reject(error), 0));
}

/** Resolves on the next tick, for symmetry with `rejectsLater`. */
function resolvesLater<T>(value: T): () => Promise<T> {
  return () => new Promise((resolve) => setTimeout(() => resolve(value), 0));
}

class StubAuthService {
  readonly tenantUsers = mockTenantUsers;
  readonly authState = signal<string | null>(null);
  readonly appConfig = signal<unknown>(null);
  readonly profile = signal<unknown>(null);
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
        useValue: { getConfig: () => mockConfig },
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
  return fixture;
}

/** Click, let the rejected promise settle, re-run change detection. */
async function clickAndSettle(
  fixture: ReturnType<typeof renderWith>,
  selector: string,
): Promise<void> {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
  if (!el) throw new Error(`No element matched ${selector}`);
  (el as HTMLElement).click();
  await new Promise((r) => setTimeout(r, 5));
  fixture.detectChanges();
}

const text = (fixture: { nativeElement: HTMLElement }) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  mockConfig = { appId: 'x' };
  mockTenantUsers = signal<unknown[]>([]);
  mockApi = {};
});

// ---------------------------------------------------------------------------

describe('TenantSelector heading (TBP-634)', () => {
  it('renders the English heading when no locale is set', () => {
    expect(text(renderWith(TenantSelectorComponent))).toContain(en['tenant.chooseHeading']);
  });

  it('renders the Swedish heading at locale sv', () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const rendered = text(renderWith(TenantSelectorComponent));
    expect(rendered).toContain(sv['tenant.chooseHeading']);
    // Gone, not merely joined by the Swedish — a component rendering both
    // would satisfy a `toContain` on the Swedish alone.
    expect(rendered).not.toContain(en['tenant.chooseHeading']);
  });

  it('lets a per-component override beat the locale', () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const rendered = text(
      renderWith(TenantSelectorComponent, {
        messages: { 'tenant.chooseHeading': 'Välj kund' },
      }),
    );
    expect(rendered).toContain('Välj kund');
    expect(rendered).not.toContain(sv['tenant.chooseHeading']);
  });

  it('never renders the raw key, in any locale', () => {
    for (const locale of ['sv', 'de', 'klingon', undefined]) {
      mockConfig = { appId: 'x', locale };
      expect(text(renderWith(TenantSelectorComponent))).not.toContain('tenant.chooseHeading');
    }
  });
});

describe('TenantSelector select failure (TBP-634)', () => {
  it('shows the Swedish error when selectTenant rejects', async () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    mockTenantUsers = signal<unknown[]>([TENANT]);
    // Rejects with no message, so the component falls through to the
    // catalogue. An API error that DOES carry one is still shown verbatim —
    // that is server copy, not ours.
    mockApi = { selectTenant: rejectsLater(new Error('')) };

    const fixture = renderWith(TenantSelectorComponent);
    await clickAndSettle(fixture, '.bridge-tenant-item');

    expect(text(fixture)).toContain(sv['tenant.error.select']);
    expect(text(fixture)).not.toContain(en['tenant.error.select']);
  });

  it('shows the English error when no locale is set', async () => {
    mockTenantUsers = signal<unknown[]>([TENANT]);
    mockApi = { selectTenant: rejectsLater(new Error('')) };

    const fixture = renderWith(TenantSelectorComponent);
    await clickAndSettle(fixture, '.bridge-tenant-item');

    expect(text(fixture)).toContain(en['tenant.error.select']);
  });
});

describe('WorkspaceSelector errors (TBP-634)', () => {
  it('shows the Swedish load error when getWorkspaces rejects', async () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    mockApi = { getWorkspaces: rejectsLater(new Error('')) };

    const fixture = renderWith(WorkspaceSelectorComponent);
    await new Promise((r) => setTimeout(r, 5));
    fixture.detectChanges();

    expect(text(fixture)).toContain(sv['workspace.error.load']);
    expect(text(fixture)).not.toContain(en['workspace.error.load']);
  });

  it('shows the Swedish switch error when switchWorkspace rejects', async () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    mockApi = {
      getWorkspaces: resolvesLater([WORKSPACE]),
      switchWorkspace: rejectsLater(new Error('')),
    };

    const fixture = renderWith(WorkspaceSelectorComponent);
    await new Promise((r) => setTimeout(r, 5));
    fixture.detectChanges();
    await clickAndSettle(fixture, '[data-bridge-workspace-item]');

    expect(text(fixture)).toContain(sv['workspace.error.switch']);
    expect(text(fixture)).not.toContain(en['workspace.error.switch']);
  });

  it('shows the English load error when no locale is set', async () => {
    mockApi = { getWorkspaces: rejectsLater(new Error('')) };

    const fixture = renderWith(WorkspaceSelectorComponent);
    await new Promise((r) => setTimeout(r, 5));
    fixture.detectChanges();

    expect(text(fixture)).toContain(en['workspace.error.load']);
  });
});

describe('SsoButton label (TBP-634)', () => {
  it('interpolates the provider name into the localised label', () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const rendered = text(renderWith(SsoButtonComponent, { connection: CONNECTION }));
    expect(rendered).toContain(sv['sso.continueWith'].replace('{provider}', 'Google'));
    expect(rendered).not.toContain('{provider}');
    expect(rendered).not.toContain(en['sso.continueWith'].replace('{provider}', 'Google'));
  });

  it('still lets the app supply its own label — that is voice, not mechanics', () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const rendered = text(
      renderWith(SsoButtonComponent, {
        connection: CONNECTION,
        label: 'Logga in med jobbkontot',
      }),
    );
    expect(rendered).toContain('Logga in med jobbkontot');
    expect(rendered).not.toContain(sv['sso.continueWith'].split('{')[0].trim());
  });

  it('falls back to English for an unsupported locale, never to the key', () => {
    mockConfig = { appId: 'x', locale: 'klingon' };
    const rendered = text(renderWith(SsoButtonComponent, { connection: CONNECTION }));
    expect(rendered).toContain(en['sso.continueWith'].replace('{provider}', 'Google'));
    expect(rendered).not.toContain('sso.continueWith');
  });

  it('re-reads the label when `messages` arrives after construction', () => {
    // `label`, `messages` and `connection` are plain @Input()s, not signal
    // inputs. A computed() would capture their construction-time values and
    // never update, which is why buttonLabel() is a method.
    mockConfig = { appId: 'x', locale: 'sv' };
    const fixture = renderWith(SsoButtonComponent, { connection: CONNECTION });
    (fixture.componentInstance as Record<string, unknown>).messages = {
      'sso.continueWith': 'Logga in via {provider}',
    };
    fixture.detectChanges();
    expect(text(fixture)).toContain('Logga in via Google');
  });
});

describe('SsoButton errors (TBP-634)', () => {
  async function capture(stub: () => Promise<unknown>): Promise<Error | null> {
    mockApi = { startSsoLogin: stub };
    let reported: Error | null = null;
    const fixture = renderWith(SsoButtonComponent, { connection: CONNECTION });
    fixture.componentInstance.error.subscribe((e: Error) => (reported = e));
    await clickAndSettle(fixture, 'button');
    return reported;
  }

  it('reports the pop-up-blocked error in Swedish', async () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const reported = await capture(rejectsLater(new Error('popup closed by user')));
    expect(reported?.message).toBe(sv['sso.error.popupBlocked']);
  });

  it('reports the generic SSO failure in Swedish', async () => {
    mockConfig = { appId: 'x', locale: 'sv' };
    const reported = await capture(resolvesLater({ type: 'auth_error', error: '' }));
    expect(reported?.message).toBe(sv['sso.error.login']);
  });

  it('still surfaces a server-supplied message verbatim', async () => {
    // The catalogue is the FALLBACK. A server that explains what went wrong
    // must not have its explanation replaced by a generic translated one.
    mockConfig = { appId: 'x', locale: 'sv' };
    const reported = await capture(
      rejectsLater(new Error('Connection is disabled for this tenant')),
    );
    expect(reported?.message).toBe('Connection is disabled for this tenant');
  });
});

describe('LoginForm → TenantSelector fan-out (TBP-634)', () => {
  it('passes messages down, the way it already does to MfaChallenge', () => {
    // Only renders on the multi-workspace auth state, which is why it is the
    // fan-out that gets forgotten.
    mockConfig = { appId: 'x', locale: 'sv' };
    mockTenantUsers = signal<unknown[]>([TENANT]);

    setup();
    const fixture = TestBed.createComponent(LoginFormComponent);
    const svc = TestBed.inject(AuthService) as unknown as {
      authState: ReturnType<typeof signal>;
    };
    svc.authState.set('tenant-selection');
    (fixture.componentInstance as Record<string, unknown>).messages = {
      'tenant.chooseHeading': 'Välj kund',
    };
    fixture.detectChanges();

    const rendered = (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(rendered).toContain('Välj kund');
    expect(rendered).not.toContain(sv['tenant.chooseHeading']);
  });
});

// ---------------------------------------------------------------------------
// The structural half of the same bug.
//
// `[messages]` reached MfaChallenge, MfaSetup, TenantSelector and PasskeyLogin
// and stopped at SsoButton — so an app overriding `sso.continueWith` got its
// wording everywhere except the "Continue with Google" button sitting on the
// very same screen. The four that were bound were bound one at a time, and a
// test naming children one at a time has exactly the blind spot that let the
// fifth through: the child nobody thought to name is the child nobody bound.
//
// So the set under test is DERIVED, not listed. Every `<bridge-*>` element the
// LoginForm template renders is read out of the template itself, resolved to
// its component class, and filtered to the classes that extend
// TranslatableComponent — i.e. the ones that accept `messages` at all. A sixth
// translatable child added tomorrow joins this test by being added to the
// template, which is the only place anyone can forget it.
//
// The template is a string literal in the component file, so the assertion is
// made against the source. That is the same convention the rest of this file
// uses for things the DOM cannot show: a binding that is absent renders
// nothing, so there is no element to interrogate.

const SDK_AUTH_MODULES = {
  ...import.meta.glob<Record<string, unknown>>('./*.component.ts', { eager: true }),
  ...import.meta.glob<Record<string, unknown>>('./shared/*.component.ts', { eager: true }),
};

/** Every `bridge-*` component in this folder, keyed by its element selector. */
function componentsBySelector(): Map<string, { name: string; translatable: boolean }> {
  const out = new Map<string, { name: string; translatable: boolean }>();
  for (const mod of Object.values(SDK_AUTH_MODULES)) {
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const def = (exported as { ɵcmp?: { selectors?: unknown[][] } }).ɵcmp;
      const selector = def?.selectors?.[0]?.[0];
      if (typeof selector !== 'string' || !selector.startsWith('bridge-')) continue;
      out.set(selector, {
        name: (exported as { name: string }).name,
        translatable: (exported as { prototype: unknown }).prototype instanceof TranslatableComponent,
      });
    }
  }
  return out;
}

/** The inline template of `login-form.component.ts`, read from source. */
function loginFormTemplate(): string {
  // Vitest's `import.meta.url` is a dev-server URL, not a file: one, so the
  // path is resolved from the vitest root (`bridge-angular/`) instead.
  const path = resolve(process.cwd(), 'src/lib/components/sdk-auth/login-form.component.ts');
  if (!existsSync(path)) {
    throw new Error(`Could not read the LoginForm source at ${path} — has the component moved?`);
  }
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('template: `');
  const end = source.indexOf('`,\n})', start);
  if (start === -1 || end === -1) {
    throw new Error('Could not locate the LoginForm inline template — has the component moved?');
  }
  return source.slice(start + 'template: `'.length, end);
}

/** Every `<bridge-x …>` opening tag in `template`, in source order. */
function childOpeningTags(template: string): Array<{ selector: string; tag: string }> {
  return [...template.matchAll(/<(bridge-[a-z0-9-]+)\b([^>]*)>/g)].map((m) => ({
    selector: m[1],
    tag: m[0],
  }));
}

describe('LoginForm fans `messages` to every child that takes it (TBP-634)', () => {
  const known = componentsBySelector();
  const tags = childOpeningTags(loginFormTemplate());
  const rendered = [...new Set(tags.map((t) => t.selector))].sort();
  const translatable = rendered.filter((s) => known.get(s)?.translatable);

  it('derived a sane set to check — the guard against a vacuous pass', () => {
    // Every assertion below is a loop over a derived list. A regex that stops
    // matching, a glob that resolves nothing, or a renamed `ɵcmp` would empty
    // those lists and turn the whole describe green while checking nothing.
    expect(rendered.length).toBeGreaterThanOrEqual(5);
    // Two anchors by name: the fan-out that was already right, and the one that
    // was not.
    expect(translatable).toContain('bridge-tenant-selector');
    expect(translatable).toContain('bridge-sso-button');
    expect(translatable.length).toBeGreaterThanOrEqual(4);
    // …and every child the template renders must be a component we resolved,
    // so a new one cannot slip past the filter as "not translatable".
    expect(rendered.filter((s) => !known.has(s))).toEqual([]);
  });

  for (const selector of translatable) {
    it(`binds [messages] on every <${selector}>`, () => {
      const occurrences = tags.filter((t) => t.selector === selector);
      expect(occurrences.length).toBeGreaterThan(0);
      for (const { tag } of occurrences) {
        expect(tag).toContain('[messages]="messages"');
      }
    });
  }

  it('leaves the children that cannot take `messages` alone', () => {
    // The complement matters too: binding an input a component does not declare
    // is an Angular template error, so "bind it everywhere" is not the fix.
    for (const selector of rendered.filter((s) => !known.get(s)?.translatable)) {
      for (const { tag } of tags.filter((t) => t.selector === selector)) {
        expect(tag).not.toContain('[messages]');
      }
    }
  });
});

describe('LoginForm → SsoButton fan-out, on screen (TBP-634)', () => {
  it('lets a host override the SSO label from the login form', () => {
    // The structural test above says the binding exists; this one says it
    // arrives. SsoButton renders on the ordinary credentials screen, next to
    // the password field whose copy the same override already reached.
    mockConfig = { appId: 'x', locale: 'sv' };

    setup();
    const fixture = TestBed.createComponent(LoginFormComponent);
    const svc = TestBed.inject(AuthService) as unknown as {
      authState: ReturnType<typeof signal>;
    };
    svc.authState.set('unauthenticated');
    Object.assign(fixture.componentInstance as Record<string, unknown>, {
      ssoConnections: [CONNECTION],
      messages: { 'sso.continueWith': 'Logga in via {provider}' },
    });
    fixture.detectChanges();

    const out = (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(out).toContain('Logga in via Google');
    // Gone, not merely joined by the override.
    expect(out).not.toContain(sv['sso.continueWith'].split('{')[0].trim());
  });
});
