/**
 * TBP-644 — the development-only "Live updates off — why?" badge, its mounter,
 * and its registration in `provideBridge()`. (Production mode is covered in
 * `realtime-dev-badge.prod.spec.ts`, which needs `isDevMode()` mocked for the
 * whole file.)
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { APP_BOOTSTRAP_LISTENER, ApplicationRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RealtimeStatus } from '@nebulr-group/bridge-auth-core';
import { RealtimeDevBadgeComponent } from './realtime-dev-badge.component';
import { RealtimeDevBadgeMounter } from './realtime-dev-badge.mounter';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { BridgeBootstrapService } from '../../bootstrap/bridge-bootstrap.service';
import { provideBridge } from '../../provide-bridge';
import { _setRealtimeStatusDetail } from '../../core/realtime-status';
import {
  REALTIME_BADGE_RETRYING_AFTER_MS,
  createRetryClock,
  realtimeBadgeView,
} from '../../core/realtime-dev-badge';

const unauthorized: RealtimeStatus = {
  state: 'unauthorized',
  reason: 'wrong_app',
  side: 'config',
  retrying: false,
  docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#wrong_app',
  ref: 'c0ffee42',
  since: 1,
};
const open: RealtimeStatus = { state: 'open', retrying: false, since: 1 };
const retrying: RealtimeStatus = {
  state: 'closed',
  reason: 'connection_lost',
  side: 'network',
  retrying: true,
  ref: 'r1',
  since: 1,
};

let fixture: ComponentFixture<RealtimeDevBadgeComponent>;
const el = () => fixture.nativeElement as HTMLElement;
const toggle = () =>
  el().querySelector<HTMLButtonElement>('[aria-controls="bridge-realtime-dev-badge-panel"]');

function render(status: RealtimeStatus, enabled?: boolean): void {
  _setRealtimeStatusDetail(status);
  fixture = TestBed.createComponent(RealtimeDevBadgeComponent);
  if (enabled !== undefined) fixture.componentRef.setInput('enabled', enabled);
  fixture.detectChanges();
}

beforeEach(() => {
  _setRealtimeStatusDetail({ state: 'idle', retrying: false, since: 0 });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RealtimeDevBadgeComponent] });
});

describe('<bridge-realtime-dev-badge>', () => {
  it('shows while live updates are off and expands to the reason, whose side, docs link and ref', () => {
    render(unauthorized);
    const button = toggle()!;
    expect(button.textContent).toContain('Live updates off — why?');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('[aria-live="polite"]')!.textContent).toBe(
      'Bridge live updates are off: wrong_app',
    );

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = el().querySelector('#bridge-realtime-dev-badge-panel')!;
    expect(panel.textContent).toContain('wrong_app');
    expect(panel.textContent).toContain('c0ffee42');
    expect(panel.textContent).toContain('Your Bridge settings');
    expect(panel.querySelector('a')!.getAttribute('href')).toBe(unauthorized.docsUrl);
  });

  it('Escape collapses the panel and returns focus to the toggle', () => {
    render(unauthorized);
    const button = toggle()!;
    button.click();
    fixture.detectChanges();
    el()
      .querySelector('#bridge-realtime-dev-badge-panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('dismisses until a NEW problem arrives', () => {
    render(unauthorized);
    el().querySelector<HTMLButtonElement>('[aria-label="Dismiss the live updates notice"]')!.click();
    fixture.detectChanges();
    expect(toggle()).toBeNull();

    _setRealtimeStatusDetail({ ...unauthorized, since: 2 });
    fixture.detectChanges();
    expect(toggle()).toBeNull();
    _setRealtimeStatusDetail({ ...unauthorized, ref: 'another1', reason: 'expired', side: 'app' });
    fixture.detectChanges();
    expect(toggle()).not.toBeNull();
  });

  it('renders nothing while live updates work', () => {
    render(open);
    expect(toggle()).toBeNull();
  });

  it('renders nothing when opted out', () => {
    render(unauthorized, false);
    expect(el().querySelector('[data-testid="bridge-realtime-dev-badge-root"]')).toBeNull();
  });

  it('origin_not_allowed (TBP-669): names the allowed origins and shows the fix, even while open', () => {
    // As an auth-core before TBP-669 passes it through from /realtime/diagnose:
    // side `app`, no hint, and `open` because only the app channel was refused.
    render({ state: 'open', reason: 'origin_not_allowed', side: 'app', retrying: false, ref: 'o1', since: 1 });
    toggle()!.click();
    fixture.detectChanges();
    const panel = el().querySelector('#bridge-realtime-dev-badge-panel')!;
    expect(panel.textContent).toContain('origin_not_allowed');
    expect(panel.textContent).toContain('allowed origins');
    expect(panel.textContent).not.toContain('apiBaseUrl');
    const hint = el().querySelector('[data-testid="bridge-realtime-dev-badge-hint"]');
    expect(hint?.textContent).toContain(window.location.origin);
    expect(hint?.textContent).toContain('Authentication → Security → Allowed Origins');
  });

  it('shows no Fix row for reasons without a fix sentence', () => {
    render(unauthorized);
    toggle()!.click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="bridge-realtime-dev-badge-hint"]')).toBeNull();
  });
});

describe('RealtimeDevBadgeMounter', () => {
  function configure(devBadge?: boolean): RealtimeDevBadgeMounter {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'a', devBadge }) } }],
    });
    return TestBed.inject(RealtimeDevBadgeMounter);
  }

  afterEach(() => {
    document.querySelectorAll('bridge-realtime-dev-badge').forEach((n) => n.remove());
  });

  it('mounts the badge into document.body and it tracks the live status', () => {
    const mounter = configure();
    mounter.mount();
    mounter.mount(); // idempotent
    expect(document.querySelectorAll('bridge-realtime-dev-badge')).toHaveLength(1);

    _setRealtimeStatusDetail(unauthorized);
    TestBed.inject(ApplicationRef).tick();
    expect(document.body.textContent).toContain('Live updates off — why?');

    mounter.unmount();
    expect(document.querySelector('bridge-realtime-dev-badge')).toBeNull();
  });

  it('respects devBadge: false', () => {
    configure(false).mount();
    expect(document.querySelector('bridge-realtime-dev-badge')).toBeNull();
  });
});

describe('provideBridge() mounts the badge without any app code', () => {
  it('registers an APP_BOOTSTRAP_LISTENER that mounts it', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideBridge({ appId: 'a' }),
        // Keep the APP_INITIALIZER side of provideBridge inert — this test is
        // about the bootstrap listener.
        { provide: BridgeBootstrapService, useValue: { bootstrap: async () => {} } },
        { provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'a' }) } },
      ],
    });
    const listeners = TestBed.inject(APP_BOOTSTRAP_LISTENER);
    for (const listener of listeners) listener(undefined as never);
    expect(document.querySelectorAll('bridge-realtime-dev-badge')).toHaveLength(1);
    TestBed.inject(RealtimeDevBadgeMounter).unmount();
  });
});

describe('realtimeBadgeView', () => {
  it("shows for 'degraded' and builds the docs link from the reason", () => {
    expect(
      realtimeBadgeView({ state: 'degraded', reason: 'no_channel_accepted', retrying: false, since: 1 }, undefined, 0),
    ).toMatchObject({ docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#no_channel_accepted' });
  });

  it('shows a retry run only after 30 s, keyed by its ref across state flips', () => {
    expect(realtimeBadgeView(retrying, 0, REALTIME_BADGE_RETRYING_AFTER_MS - 1)).toBeNull();
    const a = realtimeBadgeView(retrying, 0, REALTIME_BADGE_RETRYING_AFTER_MS);
    const b = realtimeBadgeView({ ...retrying, state: 'connecting' }, 0, REALTIME_BADGE_RETRYING_AFTER_MS);
    expect(a?.sideLabel).toMatch(/network/i);
    expect(a?.key).toBe(b?.key);
  });

  it('the retry clock measures from the first status of a run and resets on recovery', () => {
    const clock = createRetryClock();
    expect(clock(retrying, 100)).toBe(100);
    expect(clock({ ...retrying, state: 'connecting' }, 5_000)).toBe(100);
    expect(clock(open, 6_000)).toBeUndefined();
  });
});
