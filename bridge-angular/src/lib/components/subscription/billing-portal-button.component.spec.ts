import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeBillingRoutes } from '../../routing/bridge-routes';
import { AuthService, type SubscriptionState } from '../../shared/services/auth.service';
import { BillingPortalButtonComponent } from './billing-portal-button.component';

/**
 * TBP-937 — `<bridge-billing-portal-button>` (added in TBP-744, untested until
 * now). Same contract as bridge-svelte / bridge-react / bridge-nextjs
 * `<BillingPortalButton>`: shown only to the workspace owner, on an app with
 * payments on, whose workspace has a plan; fetches a one-time portal URL at
 * click time and follows it; shows the error and re-enables on failure. And it
 * is on the subscription page `bridgeBillingRoutes()` serves.
 */

type Status = NonNullable<SubscriptionState['status']>;

const PAID: Status = { paymentsEnabled: true, shouldSelectPlan: false } as Status;

/** jsdom cannot follow a cross-origin URL, so the "portal" is a hash on this page. */
const PORTAL_URL = () => `${window.location.origin}${window.location.pathname}#stripe-portal-session`;

class StubAuthService {
  readonly sub = signal<SubscriptionState>({ status: PAID, plans: [], loading: false, error: null });
  readonly signedIn = signal(true);
  readonly subscription = this.sub.asReadonly();
  readonly isAuthenticated = this.signedIn.asReadonly();
  readonly bridgeAuth = {
    canManageBilling: vi.fn((): boolean => true),
    getBillingPortalUrl: vi.fn(async (): Promise<string> => PORTAL_URL()),
    // Read by <bridge-subscription-status> on the subscription page; no token
    // keeps it off the network.
    getApiContext: () => ({ apiBaseUrl: 'https://api.example.test', accessToken: null, appId: 'app' }),
  };
  getBridgeAuth() {
    return this.bridgeAuth;
  }
  async loadSubscription(): Promise<void> {
    /* state is pre-seeded */
  }
}

@Component({
  standalone: true,
  imports: [BillingPortalButtonComponent],
  template: `<bridge-billing-portal-button [label]="label" className="my-button" />`,
})
class HostComponent {
  label = 'Manage billing';
}

let auth: StubAuthService;

function render(label?: string) {
  const fixture = TestBed.createComponent(HostComponent);
  if (label) fixture.componentInstance.label = label;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, button: () => el.querySelector<HTMLButtonElement>('[data-bridge-billing-portal]') };
}

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await Promise.resolve();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('BillingPortalButtonComponent (TBP-937)', () => {
  beforeEach(() => {
    auth = new StubAuthService();
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: AuthService, useValue: auth }],
    });
  });

  afterEach(() => {
    history.replaceState(null, '', window.location.pathname);
  });

  it('renders "Manage billing" for the owner of a workspace with a plan on a paying app', () => {
    const { button } = render();
    expect(button()).not.toBeNull();
    expect(button()!.textContent?.trim()).toBe('Manage billing');
    expect(button()!.type).toBe('button');
    expect(button()!.disabled).toBe(false);
  });

  it('keeps its own classes and adds className; label is configurable', () => {
    const { button } = render('Billing & invoices');
    expect(button()!.textContent?.trim()).toBe('Billing & invoices');
    expect(button()!.classList).toContain('bridge-btn-secondary');
    expect(button()!.classList).toContain('bridge-billing-portal-btn');
    expect(button()!.classList).toContain('my-button');
  });

  it('is hidden for a member who is not the workspace owner', () => {
    auth.bridgeAuth.canManageBilling.mockReturnValue(false);
    expect(render().button()).toBeNull();
  });

  it('is hidden when the owner check throws (SDK not ready)', () => {
    auth.bridgeAuth.canManageBilling.mockImplementation(() => {
      throw new Error('not initialised');
    });
    expect(render().button()).toBeNull();
  });

  it('is hidden when the app has payments off', () => {
    auth.sub.set({ status: { ...PAID, paymentsEnabled: false }, plans: [], loading: false, error: null });
    expect(render().button()).toBeNull();
  });

  it('is hidden for a workspace with no plan yet (it picks one first)', () => {
    auth.sub.set({ status: { ...PAID, shouldSelectPlan: true }, plans: [], loading: false, error: null });
    expect(render().button()).toBeNull();
  });

  it('is hidden while the subscription has not loaded, and when signed out', () => {
    auth.sub.set({ status: null, plans: [], loading: true, error: null });
    const { fixture, button } = render();
    expect(button()).toBeNull();

    auth.sub.set({ status: PAID, plans: [], loading: false, error: null });
    fixture.detectChanges();
    expect(button()).not.toBeNull();

    auth.signedIn.set(false);
    fixture.detectChanges();
    expect(button()).toBeNull();
  });

  it('fetches a fresh portal session on each click and follows it', async () => {
    const { fixture, button } = render();
    expect(auth.bridgeAuth.getBillingPortalUrl).not.toHaveBeenCalled(); // not at render time

    button()!.click();
    fixture.detectChanges();
    expect(button()!.disabled).toBe(true); // no double click while the session is created
    await settle(fixture);

    expect(auth.bridgeAuth.getBillingPortalUrl).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#stripe-portal-session');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the error and re-enables the button when the portal cannot be opened', async () => {
    auth.bridgeAuth.getBillingPortalUrl.mockRejectedValueOnce(new Error('No Stripe customer for this workspace'));
    const { fixture, el, button } = render();

    button()!.click();
    await settle(fixture);

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No Stripe customer for this workspace');
    expect(button()!.disabled).toBe(false);
    expect(window.location.hash).toBe('');

    // A retry clears the error.
    button()!.click();
    await settle(fixture);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(window.location.hash).toBe('#stripe-portal-session');
  });

  it('falls back to a generic message when the failure is not an Error', async () => {
    auth.bridgeAuth.getBillingPortalUrl.mockRejectedValueOnce('boom');
    const { fixture, el, button } = render();

    button()!.click();
    await settle(fixture);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not open the billing portal');
  });
});

describe('the subscription page bridgeBillingRoutes() serves (TBP-937)', () => {
  beforeEach(() => {
    auth = new StubAuthService();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }, provideRouter([...bridgeBillingRoutes()])],
    });
  });

  it('shows "Manage billing" next to the current plan, with no app code', async () => {
    const harness = await RouterTestingHarness.create('/subscription');
    const el = harness.routeNativeElement as HTMLElement;
    const button = el.querySelector('.bridge-billing-current [data-bridge-billing-portal]');
    expect(button?.textContent?.trim()).toBe('Manage billing');
  });

  it('does not show it on the paywall, where the workspace has no plan yet', async () => {
    auth.sub.set({ status: { ...PAID, shouldSelectPlan: true }, plans: [], loading: false, error: null });
    const harness = await RouterTestingHarness.create('/subscription/plan');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('[data-bridge-billing-route="plan"]')).not.toBeNull();
    expect(el.querySelector('[data-bridge-billing-portal]')).toBeNull();
  });
});
