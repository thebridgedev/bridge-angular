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

/**
 * TBP-744 (TBP-515 S2) — the rest of svelte's plan-card customisation:
 * `planDescription` / `planFooter` as templates, the selected billing interval
 * in the `planCard` context, interval tabs, and cheapest-first ordering.
 * Revert-proof: origin/main had no description/footer templates, no `interval`
 * in the context and no tabs.
 */
const MONTH: PriceOfferSdk = { id: 'm', amount: 10, currency: 'usd', recurrenceInterval: 'month' };
const YEAR: PriceOfferSdk = { id: 'y', amount: 100, currency: 'usd', recurrenceInterval: 'year' };
const BIG: Plan = { key: 'big', name: 'Big', description: 'Big plan', prices: [{ ...MONTH, id: 'bm', amount: 50 }, { ...YEAR, id: 'by', amount: 500 }] };
const SMALL: Plan = { key: 'small', name: 'Small', description: 'Small plan', prices: [MONTH, YEAR] };

class TwoPlanAuth extends StubAuthService {
  private readonly _two = signal<SubscriptionState>({
    status: { shouldSelectPlan: true } as SubscriptionState['status'],
    plans: [BIG, SMALL],
    loading: false,
    error: null,
  });
  override readonly subscription = this._two.asReadonly();
}

@Component({
  standalone: true,
  imports: [PlanSelectorComponent],
  template: `
    <ng-template #desc let-plan="plan"><em data-test-desc>About {{ plan.name }}</em></ng-template>
    <ng-template #foot let-plan="plan" let-isCurrent="isCurrent"><small data-test-foot>{{ plan.key }}</small></ng-template>
    <ng-template #card let-plan="plan" let-interval="interval"><div data-test-card>{{ plan.name }}:{{ interval }}</div></ng-template>
    <bridge-plan-selector
      [planDescriptionTemplate]="desc"
      [planFooterTemplate]="foot"
      [planCardTemplate]="useCard ? card : undefined"
      defaultInterval="month"
    />
  `,
})
class PartsHost {
  useCard = false;
}

describe('PlanSelectorComponent — S2 customisation parity (TBP-744 / TBP-515)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartsHost],
      providers: [{ provide: AuthService, useClass: TwoPlanAuth }],
    });
  });

  it('renders description and footer templates inside the default card, cheapest plan first', () => {
    const fixture = TestBed.createComponent(PartsHost);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const descs = [...el.querySelectorAll('[data-test-desc]')].map((n) => n.textContent);
    expect(descs).toEqual(['About Small', 'About Big']);
    expect(el.querySelector('.bridge-plan-description')).toBeNull();
    expect([...el.querySelectorAll('[data-test-foot]')].map((n) => n.textContent)).toEqual(['small', 'big']);
  });

  it('offers interval tabs and shows only the selected interval’s price', () => {
    const fixture = TestBed.createComponent(PartsHost);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const tabs = [...el.querySelectorAll('.bridge-plan-interval-tab')] as HTMLButtonElement[];
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Monthly', 'Yearly']);
    expect(el.querySelectorAll('.bridge-plan-select-btn')[0].textContent).toContain('10 USD / month');
    tabs[1].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.bridge-plan-select-btn')[0].textContent).toContain('100 USD / year');
  });

  it('passes the selected interval to a custom plan card', () => {
    const fixture = TestBed.createComponent(PartsHost);
    fixture.componentInstance.useCard = true;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect([...el.querySelectorAll('[data-test-card]')].map((n) => n.textContent)).toEqual(['Small:month', 'Big:month']);
  });
});
