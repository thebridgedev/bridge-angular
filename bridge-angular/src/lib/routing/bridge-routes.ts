/**
 * TBP-744 — every sign-in page and every subscription page from one line each.
 * The Angular form of bridge-svelte's `src/routes/auth/[...bridge]` +
 * `<BridgeAuthRoutes />` and `src/routes/subscription/[...bridge]` +
 * `<BridgeBillingRoutes />` (TBP-696 / TBP-702).
 *
 *   export const routes: Routes = [
 *     ...bridgeAuthRoutes(),                       // /auth/login, /auth/signup, …
 *     {
 *       path: '',
 *       canActivateChild: [bridgeAuthGuard()],
 *       children: [
 *         ...bridgeBillingRoutes(),                // /subscription, /subscription/plan, …
 *         { path: '', component: HomeComponent },
 *       ],
 *     },
 *   ];
 *
 * Each returns a plain lazy `Routes` array (`loadComponent`), so the app spreads
 * it wherever it likes. The plugin owns the page list, so a page Bridge links to
 * (the set-password address in every signup email, the checkout return pages)
 * cannot be forgotten. An address that is not one of them falls through to the
 * app's own `**` route.
 *
 * Customising, in rungs (the same ladder as every Bridge plugin):
 *   0. nothing — the pages render in your `<router-outlet>`, inside your shell;
 *   1. `--bridge-*` CSS tokens restyle them;
 *   2. `frame` (a layout component with its own `<router-outlet>`) wraps every
 *      page, and `heading(page)` replaces each page's heading;
 *   3. take over one page: `overrides: { login: { component: MyLogin } }`, or
 *      put your own route for that address BEFORE the spread (the router takes
 *      the first match); every other page keeps working;
 *   4. headless: build on `AuthService.getBridgeAuth()`.
 */
import type { Route, Routes } from '@angular/router';
import type { Type } from '@angular/core';
import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { BRIDGE_PUBLIC_ROUTE } from '../guards/route-guard';
import type { BridgeBillingPage } from './billing-paths';

/** Every page `bridgeAuthRoutes()` serves. */
export const BRIDGE_AUTH_PAGES = [
  'login',
  'signup',
  'oauth-callback',
  'set-password',
  'forgot-password',
  'magic-link',
  'setup-passkey',
  'workspaces',
] as const;

/** One of the pages `bridgeAuthRoutes()` serves. */
export type BridgeAuthPage = (typeof BRIDGE_AUTH_PAGES)[number];

/** Pages reached from an email link, whose second segment is the one-time token. */
const TOKEN_PAGES: ReadonlySet<BridgeAuthPage> = new Set(['set-password', 'setup-passkey']);

/** Route `data` keys the page components read. */
export const BRIDGE_AUTH_PAGE_DATA = 'bridgeAuthPage';
export const BRIDGE_BILLING_PAGE_DATA = 'bridgeBillingPage';
export const BRIDGE_PAGE_OPTIONS_DATA = 'bridgePageOptions';

/** A page's own route, for `overrides`: anything a `Route` takes except its path. */
export type BridgeRouteOverride = Omit<Route, 'path'>;

interface CommonRouteOptions<P extends string> {
  /** Where the pages live. @default 'auth' / 'subscription' */
  path?: string;
  /**
   * Rung 2 — a layout component rendered around every page. It must contain a
   * `<router-outlet>`; the page renders there.
   */
  frame?: Type<unknown>;
  /** Rung 2 — each page's heading. Return `null` to keep the default. */
  heading?: (page: P) => string | null;
  /** Rung 3 — replace one page, keeping the others. */
  overrides?: Partial<Record<P, BridgeRouteOverride>>;
  /** Where a completed sign-in / checkout's "Continue" lands without a deep link. @default '/' */
  redirectTo?: string;
}

export interface BridgeAuthRoutesOptions extends CommonRouteOptions<BridgeAuthPage> {
  /** Per-key copy overrides, passed to every form. */
  messages?: MessageOverrides;
}

export type BridgeBillingRoutesOptions = CommonRouteOptions<BridgeBillingPage>;

/** What a Bridge page component reads from its route. */
export interface BridgePageOptions {
  heading?: (page: string) => string | null;
  redirectTo: string;
  messages?: MessageOverrides;
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

function wrap(path: string, frame: Type<unknown> | undefined, children: Routes, publicRoute: boolean): Routes {
  const data = publicRoute ? { [BRIDGE_PUBLIC_ROUTE]: true } : undefined;
  if (frame) return [{ path, component: frame, ...(data ? { data } : {}), children }];
  // No frame: flat routes, so an app route placed before the spread overrides
  // one page by the router's ordinary first-match rule.
  const prefix = path ? `${path}/` : '';
  return children.map((child) => ({
    ...child,
    path: child.path ? `${prefix}${child.path}` : path,
  }));
}

/**
 * The sign-in pages: login, signup, the OAuth callback, set password (where
 * signup verification and password-reset emails land), forgot password, magic
 * link, passkey setup and workspace selection.
 *
 * They are public (they carry `data.bridgePublic`, which `bridgeAuthGuard`
 * honours), so they work spread at the top level or inside a guarded parent.
 * Which sign-in methods show comes from the app's settings at runtime. In
 * hosted mode (no `loginRoute`) each page points at the hosted login instead;
 * `loginRoute: '/auth/login'` in `provideBridge()` is the whole switch to
 * in-app sign-in.
 */
export function bridgeAuthRoutes(options: BridgeAuthRoutesOptions = {}): Routes {
  const pageOptions: BridgePageOptions = {
    heading: options.heading as BridgePageOptions['heading'],
    redirectTo: options.redirectTo ?? '/',
    messages: options.messages,
  };
  const children: Routes = BRIDGE_AUTH_PAGES.map((page): Route => {
    const override = options.overrides?.[page];
    const path = TOKEN_PAGES.has(page) ? `${page}/:token` : page;
    const data = {
      [BRIDGE_PUBLIC_ROUTE]: true,
      [BRIDGE_AUTH_PAGE_DATA]: page,
      [BRIDGE_PAGE_OPTIONS_DATA]: pageOptions,
      ...(override?.data ?? {}),
    };
    if (override) return { ...override, path, data };
    return {
      path,
      data,
      loadComponent: () =>
        import('../components/routes/bridge-auth-page.component').then((m) => m.BridgeAuthPageComponent),
    };
  });
  return wrap(trimSlashes(options.path ?? 'auth'), options.frame, children, true);
}

/**
 * The subscription pages: the manage page at the base address (current plan,
 * plan picker, billing portal), the paywall `plan`, and the checkout return
 * pages `success` and `error`. These need a signed-in user: spread them inside
 * your guarded parent. Their addresses are the defaults of
 * `billing.manageRoute`, `billing.paywallRoute` and `billing.paymentErrorRoute`,
 * so nothing Bridge redirects to is a 404.
 */
export function bridgeBillingRoutes(options: BridgeBillingRoutesOptions = {}): Routes {
  const pageOptions: BridgePageOptions = {
    heading: options.heading as BridgePageOptions['heading'],
    redirectTo: options.redirectTo ?? '/',
  };
  const pages: Array<[BridgeBillingPage, string]> = [
    ['manage', ''],
    ['plan', 'plan'],
    ['success', 'success'],
    ['error', 'error'],
  ];
  const children: Routes = pages.map(([page, path]): Route => {
    const override = options.overrides?.[page];
    const data = {
      [BRIDGE_BILLING_PAGE_DATA]: page,
      [BRIDGE_PAGE_OPTIONS_DATA]: pageOptions,
      ...(override?.data ?? {}),
    };
    const pathMatch = path === '' ? { pathMatch: 'full' as const } : {};
    if (override) return { ...override, path, ...pathMatch, data };
    return {
      path,
      ...pathMatch,
      data,
      loadComponent: () =>
        import('../components/routes/bridge-billing-page.component').then((m) => m.BridgeBillingPageComponent),
    };
  });
  return wrap(trimSlashes(options.path ?? 'subscription'), options.frame, children, false);
}
