/**
 * TBP-756 — a `<bridge-feature-flag>` fallback learns why the feature is off.
 *
 * auth-core 0.8 reports it on every flag read (`reason` / `feature`). The
 * fallback template rendered with no context, so an app could not show
 * "Upgrade to use reports" for a plan-gated feature and nothing (or "ask your
 * admin") for a permission-gated one.
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BridgeService } from '../../core/bridge.service';
import { BridgeFeatureFlagFallbackDirective, FeatureFlagComponent } from './feature-flag.component';

class StubBridge {
  readonly _flagVersions = signal(0);
  result: Record<string, unknown> = { passed: false, value: false };
  evaluate() {
    return this.result;
  }
}

@Component({
  standalone: true,
  imports: [FeatureFlagComponent, BridgeFeatureFlagFallbackDirective],
  template: `
    <bridge-feature-flag key="reports">
      <span data-on>Reports</span>
      <span *bridgeFeatureFlagFallback="let value; let reason = reason; let feature = feature" data-off
        >{{ reason ?? 'none' }}|{{ feature ?? 'none' }}|{{ value }}</span
      >
    </bridge-feature-flag>
  `,
})
class HostComponent {}

let bridge: StubBridge;

beforeEach(() => {
  bridge = new StubBridge();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BridgeService, useValue: bridge }] });
});

function render(): HTMLElement {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('<bridge-feature-flag> fallback context (TBP-756)', () => {
  it('a plan-gated feature: the fallback gets reason "plan" and the plan feature', () => {
    bridge.result = { passed: false, value: false, reason: 'plan', feature: 'advanced_reports' };
    const el = render();
    expect(el.querySelector('[data-on]')).toBeNull();
    expect(el.querySelector('[data-off]')?.textContent?.trim()).toBe('plan|advanced_reports|false');
  });

  it('a permission-gated feature: reason "permission", no plan feature', () => {
    bridge.result = { passed: false, value: false, reason: 'permission' };
    expect(render().querySelector('[data-off]')?.textContent?.trim()).toBe('permission|none|false');
  });

  it('no reason from Bridge (flag not loaded yet): the fallback still renders, reason undefined', () => {
    expect(render().querySelector('[data-off]')?.textContent?.trim()).toBe('none|none|false');
  });

  it('on: the content renders, the fallback does not', () => {
    bridge.result = { passed: true, value: true };
    const el = render();
    expect(el.querySelector('[data-on]')).not.toBeNull();
    expect(el.querySelector('[data-off]')).toBeNull();
  });
});
