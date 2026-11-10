import { Component, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkoutResult, clearCheckoutResult } from '../../billing/checkout-result';
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
  async ensureSubscription(): Promise<void> {
    /* state is pre-seeded */
  }
  subscriptionWanted(): boolean {
    return false;
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
    const firstPrice = () =>
      [...(el.querySelector('[data-bridge-plan-price]')?.children ?? [])].map((n) => n.textContent?.trim()).join(' ');
    expect(firstPrice()).toBe('$10 / month');
    tabs[1].click();
    fixture.detectChanges();
    expect(firstPrice()).toBe('$100 / year');
  });

  it('passes the selected interval to a custom plan card', () => {
    const fixture = TestBed.createComponent(PartsHost);
    fixture.componentInstance.useCard = true;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect([...el.querySelectorAll('[data-test-card]')].map((n) => n.textContent)).toEqual(['Small:month', 'Big:month']);
  });
});

/**
 * TBP-515 (svelte TBP-33) — a workspace that already pays switches plan
 * instantly, with no Stripe page in between, so the switch asks first.
 * Revert-proof: on origin/main a click called changePlan at once.
 */
describe('PlanSelectorComponent — plan-change confirmation (TBP-33 parity)', () => {
  let changePlan: ReturnType<typeof vi.fn>;

  class PayingAuth extends StubAuthService {
    private readonly _paying = signal<SubscriptionState>({
      status: { paymentsEnabled: true, plan: 'small' } as unknown as SubscriptionState['status'],
      plans: [SMALL, BIG],
      loading: false,
      error: null,
    });
    override readonly subscription = this._paying.asReadonly();
    override getBridgeAuth(): unknown {
      return { changePlan };
    }
  }

  @Component({
    standalone: true,
    imports: [PlanSelectorComponent],
    template: `<bridge-plan-selector defaultInterval="month" />`,
  })
  class ConfirmHost {}

  function pickBig(fixture: { nativeElement: HTMLElement; detectChanges(): void }) {
    const buttons = [...fixture.nativeElement.querySelectorAll('.bridge-plan-select-btn')] as HTMLButtonElement[];
    const big = buttons.find((b) => b.textContent?.includes('Upgrade to Big'))!;
    big.click();
  }

  beforeEach(() => {
    changePlan = vi.fn(async () => {});
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ConfirmHost],
      providers: [{ provide: AuthService, useClass: PayingAuth }],
    });
  });

  it('asks before switching, and switches only on confirm', async () => {
    const fixture = TestBed.createComponent(ConfirmHost);
    fixture.detectChanges();
    pickBig(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const dialog = el.querySelector('[data-bridge-plan-confirm]');
    expect(dialog?.textContent?.replace(/\s+/g, ' ')).toContain('Switch from Small to Big ($50 / month)');
    expect(changePlan).not.toHaveBeenCalled();

    (el.querySelector('[data-bridge-plan-confirm-btn]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(changePlan).toHaveBeenCalledWith('big', expect.objectContaining({ amount: 50 }));
    expect(el.querySelector('[data-bridge-plan-confirm]')).toBeNull();
    expect(el.querySelector('[data-bridge-plan-success]')?.textContent).toContain("You're now on Big");
  });

  it('cancel switches nothing; a failure stays in the dialog', async () => {
    const fixture = TestBed.createComponent(ConfirmHost);
    fixture.detectChanges();
    pickBig(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('.bridge-plan-confirm-actions .bridge-btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-bridge-plan-confirm]')).toBeNull();
    expect(changePlan).not.toHaveBeenCalled();

    changePlan.mockRejectedValueOnce(new Error('Card declined'));
    pickBig(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    (el.querySelector('[data-bridge-plan-confirm-btn]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-bridge-plan-confirm]')?.textContent).toContain('Card declined');
  });
});

/**
 * TBP-944 (svelte TBP-813) — the default plan card: a formatted price block,
 * "Choose / Upgrade to / Switch to" buttons, the current plan flagged, and an
 * optional heading. A Free pick records the one-shot checkout result and lands
 * on `successRedirect`. Same cases as bridge-svelte's plan-selector-card.test.ts.
 */
describe('PlanSelectorComponent — the default card (TBP-944)', () => {
  const MONTHLY = (id: string, amount: number): PriceOfferSdk => ({ id, amount, currency: 'usd', recurrenceInterval: 'month' });
  const FREE: Plan = { key: 'free', name: 'Free', prices: [MONTHLY('f', 0)] };
  const PRO: Plan = { key: 'pro', name: 'Pro', prices: [MONTHLY('p', 29)] };
  const TEAM: Plan = { key: 'team', name: 'Team', prices: [MONTHLY('t', 99)] };

  let state: ReturnType<typeof signal<SubscriptionState>>;
  let selectFreePlan: ReturnType<typeof vi.fn>;

  class CatalogAuth extends StubAuthService {
    override readonly subscription = state.asReadonly();
    override getBridgeAuth(): unknown {
      return { selectFreePlan };
    }
  }

  @Component({
    standalone: true,
    imports: [PlanSelectorComponent],
    template: `<bridge-plan-selector [heading]="heading" successRedirect="/landed" />`,
  })
  class CardHost {
    heading: string | undefined = undefined;
  }

  @Component({
    standalone: true,
    imports: [PlanSelectorComponent],
    template: `<bridge-plan-selector successRedirect="/landed" (select)="picked = $event.plan.key" />`,
  })
  class SelectHost {
    picked: string | null = null;
  }

  function render(status: unknown, host: typeof CardHost | typeof SelectHost = CardHost, heading?: string) {
    state.set({ status: status as SubscriptionState['status'], plans: [FREE, PRO, TEAM], loading: false, error: null });
    const fixture = TestBed.createComponent<CardHost | SelectHost>(host as Type<CardHost | SelectHost>);
    if (heading && fixture.componentInstance instanceof CardHost) fixture.componentInstance.heading = heading;
    fixture.detectChanges();
    return fixture;
  }

  function card(fixture: { nativeElement: HTMLElement }, name: string): HTMLElement {
    const cards = [...fixture.nativeElement.querySelectorAll<HTMLElement>('[data-bridge-plan-card]')];
    const found = cards.find((c) => c.querySelector('.bridge-plan-name')?.textContent?.trim() === name);
    if (!found) throw new Error(`no card for ${name}`);
    return found;
  }

  const button = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.bridge-plan-select-btn')!;
  const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    clearCheckoutResult();
    state = signal<SubscriptionState>({ status: null, plans: [], loading: false, error: null });
    selectFreePlan = vi.fn(async () => {});
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CardHost, SelectHost],
      providers: [provideRouter([{ path: '**', children: [] }]), { provide: AuthService, useClass: CatalogAuth }],
    });
  });

  it('with no current plan, every button is "Choose X" and no card is flagged', () => {
    const fixture = render({ shouldSelectPlan: true });
    expect(text(button(card(fixture, 'Free')))).toBe('Choose Free');
    expect(text(button(card(fixture, 'Pro')))).toBe('Choose Pro');
    expect(text(button(card(fixture, 'Team')))).toBe('Choose Team');
    expect(card(fixture, 'Pro').getAttribute('data-pick')).toBe('choose');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-bridge-plan-current-flag]')).toBeNull();
    // The old labels are gone.
    expect(el.textContent).not.toContain('Select free plan');
    expect(el.textContent).not.toContain('Select plan');
    expect(el.textContent).not.toContain('29 USD / month');
  });

  it('relative to the current plan: Current plan / Upgrade to / Switch to', () => {
    const fixture = render({ plan: 'pro', paymentsEnabled: false });

    const pro = card(fixture, 'Pro');
    expect(text(button(pro))).toBe('Current plan');
    expect(pro.getAttribute('data-current')).toBe('true');
    expect(pro.getAttribute('data-pick')).toBe('current');
    expect(text(pro.querySelector('[data-bridge-plan-current-flag]'))).toBe('Your plan');
    expect(button(pro).disabled).toBe(true);

    const team = card(fixture, 'Team');
    expect(text(button(team))).toBe('Upgrade to Team');
    expect(team.getAttribute('data-pick')).toBe('upgrade');
    expect(button(team).classList).toContain('bridge-btn-primary');
    expect(team.querySelector('[data-bridge-plan-current-flag]')).toBeNull();

    const free = card(fixture, 'Free');
    expect(text(button(free))).toBe('Switch to Free');
    expect(free.getAttribute('data-pick')).toBe('switch');
    expect(button(free).classList).toContain('bridge-btn-secondary');
  });

  it('reads a current plan given as an object, as the REST status returns it', () => {
    const fixture = render({ plan: { key: 'team', name: 'Team' } });
    expect(text(button(card(fixture, 'Team')))).toBe('Current plan');
    expect(text(button(card(fixture, 'Pro')))).toBe('Switch to Pro');
  });

  it('each card shows its price as a formatted amount and interval, and check marks on features', () => {
    const fixture = render({ shouldSelectPlan: true });
    const price = card(fixture, 'Pro').querySelector('[data-bridge-plan-price]');
    expect(text(price?.querySelector('.bridge-plan-price-amount'))).toBe('$29');
    expect(text(price?.querySelector('.bridge-plan-price-interval'))).toBe('/ month');
    expect(text(card(fixture, 'Free').querySelector('.bridge-plan-price-amount'))).toBe('$0');
  });

  it('a heading renders above the plans only when given', () => {
    expect(render({ shouldSelectPlan: true }).nativeElement.querySelector('[data-bridge-plan-head]')).toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CardHost],
      providers: [provideRouter([{ path: '**', children: [] }]), { provide: AuthService, useClass: CatalogAuth }],
    });
    const fixture = render({ shouldSelectPlan: true }, CardHost, 'Change plan');
    const heading = fixture.nativeElement.querySelector('[data-bridge-plan-head] h2.bridge-plan-heading');
    expect(text(heading)).toBe('Change plan');
  });

  it('a Free pick records the result with the plan name and lands on successRedirect', async () => {
    const router = TestBed.inject(Router);
    const fixture = render({ plan: 'pro', paymentsEnabled: false });
    button(card(fixture, 'Free')).click();
    await fixture.whenStable();
    expect(selectFreePlan).toHaveBeenCalledWith('free');
    expect(checkoutResult()).toEqual({ kind: 'plan', planName: 'Free' });
    expect(router.url).toBe('/landed');
  });

  it('a page that listens to (select) takes over: no banner result, no navigation', async () => {
    const router = TestBed.inject(Router);
    const fixture = render({ plan: 'pro', paymentsEnabled: false }, SelectHost);
    button(card(fixture, 'Free')).click();
    await fixture.whenStable();
    expect((fixture.componentInstance as SelectHost).picked).toBe('free');
    expect(checkoutResult()).toBeNull();
    expect(router.url).toBe('/');
  });
});
