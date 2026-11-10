import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { useBridge, type Plan } from '@nebulr-group/bridge-auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutResult, clearCheckoutResult, markCheckoutComplete } from '../../billing/checkout-result';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { bridgeAuthRoutes, bridgeBillingRoutes } from '../../routing/bridge-routes';
import { AuthService, type SubscriptionState } from '../../shared/services/auth.service';
import { CheckoutNoticeComponent } from './checkout-notice.component';

/**
 * TBP-944 (svelte TBP-813) — after a paid checkout or a Free pick the user lands
 * on the subscription page with a one-time banner naming the plan, instead of a
 * separate "You're all set" page. `<bridge-checkout-notice>` renders nothing
 * until the one-shot result is set, shows it once, and can be dismissed.
 */

const FREE: Plan = { key: 'free', name: 'Free', prices: [{ id: 'f', amount: 0, currency: 'usd', recurrenceInterval: 'month' }] };
const PRO: Plan = { key: 'pro', name: 'Pro', prices: [{ id: 'p', amount: 29, currency: 'usd', recurrenceInterval: 'month' }] };

class StubAuthService {
  readonly sub = signal<SubscriptionState>({
    status: { plan: 'pro', paymentsEnabled: false } as unknown as SubscriptionState['status'],
    plans: [FREE, PRO],
    loading: false,
    error: null,
  });
  readonly subscription = this.sub.asReadonly();
  readonly isAuthenticated = signal(true).asReadonly();
  readonly bridgeAuth = {
    selectFreePlan: vi.fn(async () => {}),
    canManageBilling: () => false,
    // No token keeps <bridge-subscription-status> off the network.
    getApiContext: () => ({ apiBaseUrl: 'https://api.example.test', accessToken: null, appId: 'app' }),
  };
  getBridgeAuth() {
    return this.bridgeAuth;
  }
  async loadSubscription(): Promise<void> {
    /* state is pre-seeded */
  }
}

const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim();

async function flush(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  fixture.detectChanges();
  await Promise.resolve();
  await fixture.whenStable();
  fixture.detectChanges();
}

let auth: StubAuthService;

beforeEach(() => {
  clearCheckoutResult();
  useBridge().subscription.setError(null);
  auth = new StubAuthService();
});

afterEach(() => clearCheckoutResult());

describe('<bridge-checkout-notice> (TBP-944)', () => {
  @Component({
    standalone: true,
    imports: [CheckoutNoticeComponent],
    template: `
      <ng-template #mine let-kind="kind" let-planName="planName"><em data-mine>{{ kind }}:{{ planName }}</em></ng-template>
      <bridge-checkout-notice [dismissible]="dismissible" [contentTemplate]="custom ? mine : undefined" />
    `,
  })
  class Host {
    dismissible = true;
    custom = false;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: AuthService, useValue: auth }] });
  });

  it('renders nothing until a checkout has just completed', async () => {
    const fixture = TestBed.createComponent(Host);
    await flush(fixture);
    expect(fixture.nativeElement.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });

  it('names the plan of a Free pick and says the change is immediate', async () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    const fixture = TestBed.createComponent(Host);
    await flush(fixture);
    const notice = fixture.nativeElement.querySelector('[data-bridge-checkout-notice]');
    expect(notice?.getAttribute('data-kind')).toBe('plan');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(text(notice?.querySelector('.bridge-checkout-notice-title'))).toBe("You're on Free now");
    expect(text(notice?.querySelector('.bridge-checkout-notice-text'))).toBe('The change takes effect right away.');
  });

  it('after a paid checkout, reads the plan name from the billing state', async () => {
    useBridge().subscription.hydrate({ plan: { slug: 'pro', name: 'Pro' }, status: 'active' } as never);
    markCheckoutComplete({ kind: 'checkout' });
    const fixture = TestBed.createComponent(Host);
    await flush(fixture);
    const notice = fixture.nativeElement.querySelector('[data-bridge-checkout-notice]');
    expect(text(notice?.querySelector('.bridge-checkout-notice-title'))).toBe("You're on Pro now");
    expect(text(notice?.querySelector('.bridge-checkout-notice-text'))).toBe(
      'Your payment went through and the new plan is active.',
    );
  });

  it('shows once: it takes the result, so the next page does not show it again', async () => {
    markCheckoutComplete({ kind: 'checkout' });
    const first = TestBed.createComponent(Host);
    await flush(first);
    expect(first.nativeElement.querySelector('[data-bridge-checkout-notice]')).not.toBeNull();
    expect(checkoutResult()).toBeNull();

    const second = TestBed.createComponent(Host);
    await flush(second);
    expect(second.nativeElement.querySelector('[data-bridge-checkout-notice]')).toBeNull();
    // The first one keeps showing what it took.
    expect(first.nativeElement.querySelector('[data-bridge-checkout-notice]')).not.toBeNull();
  });

  it('the close button dismisses it; dismissible=false has none', async () => {
    markCheckoutComplete({ kind: 'checkout' });
    const fixture = TestBed.createComponent(Host);
    await flush(fixture);
    (fixture.nativeElement.querySelector('.bridge-checkout-notice-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-bridge-checkout-notice]')).toBeNull();

    markCheckoutComplete({ kind: 'checkout' });
    const fixed = TestBed.createComponent(Host);
    fixed.componentInstance.dismissible = false;
    await flush(fixed);
    expect(fixed.nativeElement.querySelector('[data-bridge-checkout-notice]')).not.toBeNull();
    expect(fixed.nativeElement.querySelector('.bridge-checkout-notice-close')).toBeNull();
  });

  it('a contentTemplate replaces the text and gets the kind and plan name', async () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.custom = true;
    await flush(fixture);
    expect(text(fixture.nativeElement.querySelector('[data-mine]'))).toBe('plan:Free');
    expect(fixture.nativeElement.querySelector('.bridge-checkout-notice-title')).toBeNull();
  });

  it('a notice already on screen picks up a result set later (a Free pick that lands on the same page)', async () => {
    const fixture = TestBed.createComponent(Host);
    await flush(fixture);
    expect(fixture.nativeElement.querySelector('[data-bridge-checkout-notice]')).toBeNull();
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    await flush(fixture);
    expect(fixture.nativeElement.querySelector('[data-bridge-checkout-notice]')).not.toBeNull();
  });
});

describe('the subscription page from bridgeBillingRoutes() (TBP-944)', () => {
  function setup(options: Parameters<typeof bridgeBillingRoutes>[0] = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(bridgeBillingRoutes(options)), { provide: AuthService, useValue: auth }],
    });
  }

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await flush(harness.fixture);
    return harness;
  }

  it('shows the banner after a checkout, once', async () => {
    setup();
    markCheckoutComplete({ kind: 'checkout' });
    const harness = await open('/subscription');
    expect(harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]')).not.toBeNull();
    await harness.navigateByUrl('/subscription/plan');
    await harness.navigateByUrl('/subscription');
    await flush(harness.fixture);
    expect(harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });

  it('a Free pick on the subscription page lands back on it with the banner', async () => {
    setup();
    const harness = await open('/subscription');
    expect(harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]')).toBeNull();
    const free = [...(harness.routeNativeElement?.querySelectorAll<HTMLButtonElement>('.bridge-plan-select-btn') ?? [])].find(
      (b) => text(b) === 'Switch to Free',
    )!;
    free.click();
    await flush(harness.fixture);
    await flush(harness.fixture);
    expect(auth.bridgeAuth.selectFreePlan).toHaveBeenCalledWith('free');
    expect(TestBed.inject(Router).url).toBe('/subscription');
    const notice = harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]');
    expect(text(notice?.querySelector('.bridge-checkout-notice-title'))).toBe("You're on Free now");
  });

  it('checkoutNotice: false hides it', async () => {
    setup({ checkoutNotice: false });
    markCheckoutComplete({ kind: 'checkout' });
    const harness = await open('/subscription');
    expect(harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]')).toBeNull();
  });

  it('the old confirmation page still works, and clears the result so the next page shows no banner', async () => {
    setup();
    markCheckoutComplete({ kind: 'checkout' });
    const harness = await open('/subscription/success');
    expect(text(harness.routeNativeElement?.querySelector('.bridge-billing-heading'))).toBe("You're all set");
    expect(harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]')).toBeNull();
    expect(checkoutResult()).toBeNull();
  });

  it('puts the current plan in a panel with its renewal date and card, above "Change plan"', async () => {
    setup();
    useBridge().subscription.hydrate({
      plan: { slug: 'pro', name: 'Pro' },
      status: 'active',
      renewsAt: '2026-12-10T12:00:00.000Z',
      cardLast4: '4242',
    } as never);
    const harness = await open('/subscription');
    const page = harness.routeNativeElement!;
    useBridge().subscription.setError(null);
    await flush(harness.fixture);
    expect(text(page.querySelector('.bridge-billing-text'))).toBe('Your plan, what it includes, and billing.');
    const summary = page.querySelector('[data-bridge-billing-summary]');
    expect(text(summary?.querySelector('.bridge-billing-label'))).toBe('Current plan');
    expect(text(summary?.querySelector('[data-bridge-billing-meta]'))).toMatch(/^Renews .*2026 · Card ending 4242$/);
    expect(text(page.querySelector('[data-bridge-plan-head] .bridge-plan-heading'))).toBe('Change plan');
  });
});

describe('the Stripe return on the OAuth callback page (TBP-944)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('confirms the checkout, then lands on the subscription page with the banner', async () => {
    const confirmStripeCheckout = vi.fn(async () => {});
    const callbackAuth = Object.assign(auth, {
      confirmStripeCheckout,
      handleCallback: vi.fn(async () => {}),
      tokens: () => null,
      ensureAppConfig: async () => null,
      appConfig: () => null,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...bridgeAuthRoutes(), ...bridgeBillingRoutes()]),
        { provide: AuthService, useValue: callbackAuth },
      ],
    });
    TestBed.inject(BridgeConfigService).initConfig({ appId: 'app', apiBaseUrl: 'http://localhost:3000' });
    const url = '/auth/oauth-callback?stripe_success=1&session_id=cs_1&redirect=%2Fsubscription';
    window.history.replaceState(null, '', url);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    for (let i = 0; i < 4; i++) await flush(harness.fixture);

    expect(confirmStripeCheckout).toHaveBeenCalledWith('cs_1');
    expect(TestBed.inject(Router).url).toBe('/subscription');
    const notice = harness.routeNativeElement?.querySelector('[data-bridge-checkout-notice]');
    expect(notice?.getAttribute('data-kind')).toBe('checkout');
  });
});
