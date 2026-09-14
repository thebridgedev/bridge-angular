/**
 * TBP-644 — the dev badge must never reach a production app. `isDevMode()` is
 * false in a production build (`enableProdMode()`); it is mocked for this whole
 * file because prod mode cannot be switched on after the test platform exists.
 */
import { vi, beforeEach, describe, expect, it } from 'vitest';

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  isDevMode: () => false,
}));

import { TestBed } from '@angular/core/testing';
import { RealtimeDevBadgeComponent } from './realtime-dev-badge.component';
import { RealtimeDevBadgeMounter } from './realtime-dev-badge.mounter';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { _setRealtimeStatusDetail } from '../../core/realtime-status';

beforeEach(() => {
  _setRealtimeStatusDetail({
    state: 'unauthorized',
    reason: 'refused',
    side: 'bridge',
    retrying: false,
    ref: 'deadbeef',
    since: 1,
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RealtimeDevBadgeComponent],
    providers: [{ provide: BridgeConfigService, useValue: { getConfig: () => ({ appId: 'a' }) } }],
  });
});

describe('in a production build', () => {
  it('the badge renders nothing, even while live updates are off', () => {
    const fixture = TestBed.createComponent(RealtimeDevBadgeComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain('bridge-realtime-dev-badge');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Live updates off');
  });

  it('the mounter does not mount it', () => {
    TestBed.inject(RealtimeDevBadgeMounter).mount();
    expect(document.querySelector('bridge-realtime-dev-badge')).toBeNull();
  });
});
