import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService, type SubscriptionState } from '../../shared/services/auth.service';
import { PlanSelectorComponent } from './plan-selector.component';

/**
 * TBP-476 — proves the `planCardTemplate` input overrides the default plan card
 * rendering, and that omitting it keeps the default card (backward compatible).
 */

const PRICE: PriceOfferSdk = {
  id: 'price_1',
  amount: 1000,
  currency: 'usd',
  recurrenceInterval: 'month',
};

const PLAN: Plan = {
  key: 'pro',
  name: 'Pro',
  description: 'Pro plan',
  prices: [PRICE],
};

/** Minimal AuthService stub: exposes the `subscription` signal the component reads. */
class StubAuthService {
  private readonly _sub = signal<SubscriptionState>({
    status: { shouldSelectPlan: true } as SubscriptionState['status'],
    plans: [PLAN],
    loading: false,
    error: null,
  });
  readonly subscription = this._sub.asReadonly();
  async loadSubscription(): Promise<void> {
    /* no-op: state is pre-seeded */
  }
  getBridgeAuth(): unknown {
    return {};
  }
}

@Component({
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <ng-template #card let-plan="plan" let-onPick="onPick">
      <div data-test-custom-card>
        Custom {{ plan.name }}
        <button data-test-custom-pick (click)="onPick(plan.prices[0])">Pick</button>
      </div>
    </ng-template>
    <bridge-plan-selector [planCardTemplate]="withTemplate ? card : undefined" />
  `,
})
class HostComponent {
  withTemplate = false;
}

describe('PlanSelectorComponent — planCardTemplate (TBP-476)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: AuthService, useClass: StubAuthService }],
    });
  });

  it('renders the default plan card when no template is supplied', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.withTemplate = false;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-bridge-plan-card]')).not.toBeNull();
    expect(el.querySelector('[data-test-custom-card]')).toBeNull();
    // Default card shows the plan name in its header.
    expect(el.querySelector('.bridge-plan-name')?.textContent).toContain('Pro');
  });

  it('renders the custom template instead of the default card, with plan context', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.withTemplate = true;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    // Custom template rendered...
    const custom = el.querySelector('[data-test-custom-card]');
    expect(custom).not.toBeNull();
    expect(custom?.textContent).toContain('Custom Pro');
    // ...and the default card is gone.
    expect(el.querySelector('[data-bridge-plan-card]')).toBeNull();
  });
});
