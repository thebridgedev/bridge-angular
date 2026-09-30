/**
 * TBP-744 — the route arrays, the billing defaults and the OAuth callback.
 * Revert-proof: none of these modules exist on origin/main.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_PUBLIC_ROUTE } from '../guards/route-guard';
import { AuthService } from '../shared/services/auth.service';
import { BridgeConfigService } from '../config/bridge-config.service';
import {
  BRIDGE_AUTH_PAGES,
  BRIDGE_AUTH_PAGE_DATA,
  bridgeAuthRoutes,
  bridgeBillingRoutes,
} from './bridge-routes';
import { appUsesBilling, isPaywallExempt, resolveBillingPaths } from './billing-paths';
import { resolveCallbackTarget, stripeReturnTarget } from './callback';

@Component({ standalone: true, template: '<p data-mine>my login</p>' })
class MyLoginComponent {}

@Component({ standalone: true, template: '<p data-not-found>404</p>' })
class NotFoundComponent {}

@Component({ standalone: true, template: '<p data-home>home</p>' })
class HomeComponent {}

describe('bridgeAuthRoutes()', () => {
  it('serves every sign-in page as a lazy, public route under /auth', () => {
    const routes = bridgeAuthRoutes();
    expect(routes.map((r) => r.path)).toEqual([
      'auth/login',
      'auth/signup',
      'auth/oauth-callback',
      'auth/set-password/:token',
      'auth/forgot-password',
      'auth/magic-link',
      'auth/setup-passkey/:token',
      'auth/workspaces',
    ]);
    for (const route of routes) {
      expect(typeof route.loadComponent).toBe('function');
      expect(route.data?.[BRIDGE_PUBLIC_ROUTE]).toBe(true);
    }
    expect(routes.map((r) => r.data?.[BRIDGE_AUTH_PAGE_DATA])).toEqual([...BRIDGE_AUTH_PAGES]);
  });

  it('lives wherever the app puts it', () => {
    expect(bridgeAuthRoutes({ path: '/account/' })[0].path).toBe('account/login');
  });

  it('replaces one page with overrides, keeping the others', () => {
    const routes = bridgeAuthRoutes({ overrides: { login: { component: MyLoginComponent } } });
    const login = routes.find((r) => r.path === 'auth/login')!;
    expect(login.component).toBe(MyLoginComponent);
    expect(login.loadComponent).toBeUndefined();
    expect(login.data?.[BRIDGE_PUBLIC_ROUTE]).toBe(true);
    expect(routes.find((r) => r.path === 'auth/signup')!.loadComponent).toBeTypeOf('function');
  });

  it('with a frame, nests the pages under one layout route', () => {
    const routes = bridgeAuthRoutes({ frame: HomeComponent });
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('auth');
    expect(routes[0].component).toBe(HomeComponent);
    expect(routes[0].children?.map((r) => r.path)).toContain('set-password/:token');
  });
});

describe('bridgeBillingRoutes()', () => {
  it('serves the subscription page, the paywall and both checkout returns', () => {
    const routes = bridgeBillingRoutes();
    expect(routes.map((r) => r.path)).toEqual([
      'subscription',
      'subscription/plan',
      'subscription/success',
      'subscription/error',
    ]);
    expect(routes[0].pathMatch).toBe('full');
    // Signed-in pages: never marked public.
    for (const route of routes) expect(route.data?.[BRIDGE_PUBLIC_ROUTE]).toBeUndefined();
  });
});

describe('spread into a real router (TBP-744)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('an app route placed before the spread wins; an unknown address reaches the app 404', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/login', component: MyLoginComponent },
          ...bridgeAuthRoutes({ overrides: { signup: { component: HomeComponent } } }),
          { path: '**', component: NotFoundComponent },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/auth/login');
    expect(harness.routeNativeElement?.querySelector('[data-mine]')).not.toBeNull();
    await harness.navigateByUrl('/auth/signup');
    expect(harness.routeNativeElement?.querySelector('[data-home]')).not.toBeNull();
    await harness.navigateByUrl('/auth/nope');
    expect(harness.routeNativeElement?.querySelector('[data-not-found]')).not.toBeNull();
    // A token page without its token is not a Bridge page.
    await harness.navigateByUrl('/auth/set-password');
    expect(harness.routeNativeElement?.querySelector('[data-not-found]')).not.toBeNull();
  });

  it('renders the built-in page for a spread route', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...bridgeAuthRoutes(), { path: '**', component: NotFoundComponent }]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => false,
            tokens: () => null,
            getBridgeAuth: () => {
              throw new Error('not initialised');
            },
            ensureAppConfig: async () => null,
            appConfig: () => null,
          },
        },
      ],
    });
    TestBed.inject(BridgeConfigService).initConfig({ appId: 'app', apiBaseUrl: 'http://localhost:3000' });
    const harness = await RouterTestingHarness.create();
    // Hosted mode (no loginRoute): the page points at the hosted login.
    await harness.navigateByUrl('/auth/login');
    const page = harness.routeNativeElement?.querySelector('[data-bridge-auth-route]');
    expect(page?.getAttribute('data-bridge-auth-route')).toBe('login');
    expect(harness.routeNativeElement?.querySelector('[data-bridge-auth-hosted]')).not.toBeNull();
  });
});

describe('billing destinations (TBP-744, svelte TBP-702)', () => {
  it('defaults every destination to a page bridgeBillingRoutes() serves', () => {
    expect(resolveBillingPaths(undefined)).toEqual({
      manageRoute: '/subscription',
      paywallRoute: '/subscription/plan',
      paywallIsDefault: true,
      paymentErrorRoute: '/subscription/error',
      successRoute: '/subscription/success',
    });
  });

  it('keeps what the app set, and false turns the paywall off', () => {
    const paths = resolveBillingPaths({ manageRoute: '/billing/', paywallRoute: false, paymentErrorRoute: '/oops' });
    expect(paths.paywallRoute).toBeNull();
    expect(paths.paywallIsDefault).toBe(false);
    expect(paths.paymentErrorRoute).toBe('/oops');
    expect(paths.successRoute).toBe('/billing/success');
  });

  it('an app uses billing only when it has plans', () => {
    expect(appUsesBilling([{}])).toBe(true);
    expect(appUsesBilling([])).toBe(false);
    expect(appUsesBilling(null)).toBe(false);
  });

  it('never redirects the paywall or the payment-error page to itself', () => {
    const paths = resolveBillingPaths(undefined);
    expect(isPaywallExempt('/subscription/plan', paths)).toBe(true);
    expect(isPaywallExempt('/subscription/error', paths)).toBe(true);
    expect(isPaywallExempt('/projects', paths)).toBe(false);
  });
});

describe('the OAuth callback page (TBP-744)', () => {
  const paths = resolveBillingPaths(undefined);
  const deps = () => ({
    handleCallback: vi.fn(async () => {}),
    confirmStripeCheckout: vi.fn(async () => {}),
    refreshBilling: vi.fn(async () => {}),
    takeReturnTo: vi.fn(() => '/deep/link' as string | null),
  });

  it('exchanges a code and returns to the stashed deep link', async () => {
    const d = deps();
    expect(await resolveCallbackTarget(new URLSearchParams('code=abc'), paths, d)).toBe('/deep/link');
    expect(d.handleCallback).toHaveBeenCalledWith('abc');
  });

  it('falls back to the default route with no deep link', async () => {
    const d = { ...deps(), takeReturnTo: () => null };
    expect(await resolveCallbackTarget(new URLSearchParams('code=abc'), paths, d, '/home')).toBe('/home');
  });

  it('confirms a checkout, re-reads billing, and lands on its redirect', async () => {
    const d = deps();
    const params = new URLSearchParams('stripe_success=1&session_id=cs_1&redirect=%2Fsubscription%2Fsuccess');
    expect(await resolveCallbackTarget(params, paths, d)).toBe('/subscription/success');
    expect(d.confirmStripeCheckout).toHaveBeenCalledWith('cs_1');
    expect(d.refreshBilling).toHaveBeenCalled();
  });

  it('a checkout that cannot be confirmed lands on /subscription/error', async () => {
    const d = { ...deps(), confirmStripeCheckout: vi.fn(async () => {
        throw new Error('no');
      }) };
    const params = new URLSearchParams('stripe_success=1&session_id=cs_1');
    expect(await resolveCallbackTarget(params, paths, d)).toBe('/subscription/error');
  });

  it('never follows an off-site redirect', () => {
    expect(stripeReturnTarget(new URLSearchParams('redirect=https%3A%2F%2Fevil.example'), paths)).toBe('/subscription');
    expect(stripeReturnTarget(new URLSearchParams('stripe_cancel=1'), paths)).toBe('/subscription');
  });
});

