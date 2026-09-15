import { inject, type Injector } from '@angular/core';
import type { CanActivateFn, UrlTree } from '@angular/router';
import { Router } from '@angular/router';
import {
  sanitizeReturnTo,
  stashReturnTo,
  withReturnTo,
  type ReturnToConfig,
} from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeService } from '../core/bridge.service';
import { AuthService } from '../shared/services/auth.service';
import { logger } from '../shared/logger';

export type FlagRequirement = string | { any: string[] } | { all: string[] };

export type RouteRule = {
  match: string | RegExp;
  public?: boolean;
  featureFlag?: FlagRequirement;
  redirectTo?: string;
};

export interface RouteGuardConfig {
  rules: RouteRule[];
  defaultAccess?: 'public' | 'protected';
  /**
   * Deep-link preservation (TBP-629). Also settable on `BridgeConfig`; a value
   * here wins, so an app can keep all its routing config in one object.
   */
  returnTo?: ReturnToConfig;
}

// --- Pure helper functions (same logic as bridge-svelte route-guard.ts) ---

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRegExp(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return pattern;
  const hasWildcard = pattern.includes('*');
  if (!hasWildcard) {
    return new RegExp(`^${escapeRegex(pattern)}$`);
  }
  const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function findMatchingRule(
  pathname: string,
  config: RouteGuardConfig,
): RouteRule | null {
  for (const rule of config.rules) {
    if (toRegExp(rule.match).test(pathname)) {
      return rule;
    }
  }
  return null;
}

/**
 * FF 2.0 flag read for the route guard. `bridge.evaluate(key, false)` resolves
 * synchronously from the hydrated cache; `.passed` is the boolean. Replaces the
 * legacy FeatureFlagService `isFeatureEnabled` (bulkEvaluate) path.
 */
function isFlagEnabled(flag: string, bridge: BridgeService): boolean {
  return bridge.evaluate<boolean>(flag, false).passed;
}

function evaluateFlagRequirement(
  req: FlagRequirement,
  bridge: BridgeService,
): boolean {
  if (typeof req === 'string') {
    return isFlagEnabled(req, bridge);
  }
  if ('any' in req) {
    return req.any.some((f) => isFlagEnabled(f, bridge));
  }
  if ('all' in req) {
    return req.all.every((f) => isFlagEnabled(f, bridge));
  }
  return true;
}

function isPublicRoute(pathname: string, config: RouteGuardConfig): boolean {
  const rule = findMatchingRule(pathname, config);
  if (rule) {
    logger.debug(
      `[route-guard] path ${pathname} is ${rule.public ? 'public' : 'protected'} by bridge rule ${rule.match}`,
    );
    return !!rule.public;
  }
  const isPublicByDefault = (config.defaultAccess ?? 'protected') === 'public';
  logger.debug(
    `[route-guard] path ${pathname} is ${isPublicByDefault ? 'public' : 'protected'} by bridge default access ${config.defaultAccess}`,
  );
  return isPublicByDefault;
}

export type NavigationDecision =
  | { type: 'allow' }
  | { type: 'login'; loginUrl: string; returnTo?: string }
  | { type: 'redirect'; to: string; returnTo?: string };

/**
 * Reduce the attempted URL to something safe to return to after login, or null.
 *
 * TBP-629. Null covers every "just use the default route" case: opted out,
 * excluded, the login route itself, a public route, or an unsafe value.
 * `sanitizeReturnTo` is auth-core's — the open-redirect validation must not be
 * reimplemented per framework, because a second implementation is a second
 * thing to get wrong and the way this gets got wrong is an open redirect.
 */
function resolveReturnTo(
  attempted: string | null | undefined,
  config: RouteGuardConfig,
  returnToConfig: ReturnToConfig | undefined,
): string | null {
  if (returnToConfig?.enabled === false) return null;

  const safe = sanitizeReturnTo(attempted);
  if (!safe) return null;

  // Compare paths only — a query string must not let `/auth/login?x=1` slip past
  // an exclusion written as `/auth/login`.
  const path = safe.split('?')[0];

  const loginRoute = returnToConfig?.loginRoute;
  if (loginRoute && path === loginRoute.split('?')[0]) return null;

  const excluded = returnToConfig?.exclude ?? [];
  if (excluded.some((pattern) => toRegExp(pattern).test(path))) return null;

  // A public route is never what the guard turned somebody away from, and
  // sending them "back" to one after login is noise.
  if (isPublicRoute(path, config)) return null;

  return safe;
}

async function getNavigationDecision(
  pathname: string,
  config: RouteGuardConfig,
  authService: AuthService,
  bridge: BridgeService,
  paywallRoute?: string,
  isAuthCallbackInFlight = false,
  loginRoute?: string,
  attempted?: string,
  returnToConfig?: ReturnToConfig,
): Promise<NavigationDecision> {
  const authenticated = authService.isAuthenticated();
  const isPublic = isPublicRoute(pathname, config);

  logger.debug(`[route-guard] getNavigationDecision`, {
    pathname,
    isPublic,
    authenticated,
  });

  // Redirect to login if protected and not authenticated. Mirrors bridge-svelte's
  // BridgeBootstrap login decision (BridgeBootstrap.ts §4):
  //   - SDK mode: consumer set `loginRoute` → redirect to that in-app login view
  //   - Hosted mode (default): no `loginRoute` → redirect to the hosted auth portal
  if (!isPublic && !authenticated) {
    // TBP-629 — carry the page they actually asked for through the login, so a
    // deep link does not collapse to the app's default route. Null when there is
    // nothing safe or worth carrying, and both branches below behave exactly as
    // they did before this existed when it is null.
    const returnTo = resolveReturnTo(attempted, config, returnToConfig);

    if (loginRoute) {
      logger.debug(
        `[route-guard] path ${pathname} is protected and user is not authenticated; redirecting to in-app loginRoute ${loginRoute}`,
      );
      // SDK mode: the login page is the app's own, so the target rides as a
      // query parameter it can read. Visible, debuggable, and it survives a
      // cross-tab click — the emailed-link case that prompted this.
      return {
        type: 'redirect',
        to: withReturnTo(loginRoute, returnTo, returnToConfig?.param),
        ...(returnTo ? { returnTo } : {}),
      };
    }
    logger.debug(`[route-guard] path ${pathname} is protected and user is not authenticated`);
    // Hosted mode: the target CANNOT ride on the URL. `createLoginUrl()` feeds
    // `redirectUri` to the OAuth authorize call and bridge-api validates it with
    // an exact `allowedRedirectUris.includes()` match, so appending a query would
    // break login rather than improve it. Stash it instead; the app's OAuth
    // callback picks it up with `takeReturnTo()`.
    stashReturnTo(returnTo);
    return {
      type: 'login',
      loginUrl: authService.createLoginUrl(),
      ...(returnTo ? { returnTo } : {}),
    };
  }

  // Check feature flag restriction
  const rule = findMatchingRule(pathname, config);
  if (rule?.featureFlag) {
    const ok = evaluateFlagRequirement(rule.featureFlag, bridge);
    logger.debug(
      `[route-guard] path ${pathname} is restricted by bridge feature flag ${rule.featureFlag} and flag requirement evaluated to ${ok}`,
    );
    if (!ok) return { type: 'redirect', to: rule.redirectTo ?? '/' };
  }

  // Paywall redirect — the Angular analogue of bridge-svelte's BridgeBootstrap
  // paywall gate (BridgeBootstrap.ts §2b). Fires before a protected page renders.
  // Only redirects when:
  //   - billing.paywallRoute is configured
  //   - the current path is not already the paywall route (no redirect loop)
  //   - the tenant is authenticated but has not selected a plan
  //   - the app has not opted out via paymentsAutoRedirect: false
  //   - the navigation is not an in-flight auth/checkout callback
  // The last guard is essential: a Stripe return lands on the OAuth callback
  // while shouldSelectPlan is still true (the plan isn't confirmed until the
  // callback POSTs confirm-checkout). Without this exemption the paywall gate
  // would bounce the callback to the paywall route and the checkout would never
  // be confirmed. Fails open: any error fetching subscription status allows nav.
  if (
    paywallRoute &&
    authenticated &&
    pathname !== paywallRoute &&
    !isAuthCallbackInFlight
  ) {
    try {
      // shouldRedirectToPaywall (auth-core) bundles the subscription-status fetch +
      // the shouldSelectPlan/paymentsAutoRedirect decision (TBP-369), shared with
      // bridge-svelte/react/nextjs. The outer guards (paywallRoute, authenticated,
      // not-paywall-path, not-callback-in-flight) stay here.
      if (await authService.getBridgeAuth().shouldRedirectToPaywall()) {
        logger.debug(`[route-guard] paywall redirect ${pathname} → ${paywallRoute}`);
        return { type: 'redirect', to: paywallRoute };
      }
    } catch (err) {
      logger.warn('[route-guard] paywall subscription-status check failed; allowing', err);
    }
  }

  return { type: 'allow' };
}

interface GuardDeps {
  configService: BridgeConfigService;
  authService: AuthService;
  bridge: BridgeService;
}

type GuardOutcome = NavigationDecision | { type: 'deny' };

/**
 * The URL `bridgeAuthGuard` last let through. Guards only run on navigation;
 * this is how a re-check (TBP-654) knows the page the user is on right now is
 * one the guard protects — a route outside the guarded tree is never touched.
 */
let _lastAllowedUrl: string | null = null;

/** Test-only. */
export function __resetBridgeRouteGuardState(): void {
  _lastAllowedUrl = null;
}

/**
 * Angular functional route guard that replicates bridge-svelte's route-guard.ts logic.
 * Apply via canActivateChild on a parent route to protect all child routes.
 *
 * It runs on every navigation into the guarded tree — including a guard's own
 * UrlTree redirect and a route-config `redirectTo` into it — and holds no
 * "already decided" state, so there is no first-navigation window (TBP-653).
 */
export function bridgeAuthGuard(): CanActivateFn {
  return async (_route, state) => {
    const deps: GuardDeps = {
      configService: inject(BridgeConfigService),
      authService: inject(AuthService),
      bridge: inject(BridgeService),
    };
    const router = inject(Router);

    const outcome = await decideNavigation(state.url, deps);
    switch (outcome.type) {
      case 'allow':
        _lastAllowedUrl = state.url;
        return true;
      case 'deny':
        return false;
      case 'login':
        window.location.href = outcome.loginUrl;
        return false;
      case 'redirect':
        // `createUrlTree([to])` treats the whole string as one path segment and
        // drops any query on it, which would silently discard the return target
        // the login branch just attached. `parseUrl` keeps it.
        return router.parseUrl(outcome.to) as UrlTree;
    }
  };
}

/**
 * Re-evaluate the page the user is on right now (TBP-654 / TBP-653).
 *
 * Angular guards only run on navigation, so a verdict that changes while the
 * user stays put — sign-out or session expiry on a protected page, a downgrade
 * or revoked entitlement on a plan-gated one — was never applied until the
 * next click. `BridgeBootstrapService` calls this (debounced) whenever the
 * runtime reports an authorization change. Only the URL the guard itself last
 * allowed is re-checked; if the user navigated meanwhile, nothing happens.
 */
export async function recheckBridgeRoute(injector: Injector): Promise<void> {
  const router = injector.get(Router, null);
  if (!router) return;
  const url = router.url;
  if (!_lastAllowedUrl || url !== _lastAllowedUrl) return;

  const outcome = await decideNavigation(url, {
    configService: injector.get(BridgeConfigService),
    authService: injector.get(AuthService),
    bridge: injector.get(BridgeService),
  });
  // The user moved on while we were deciding — their new route was guarded by
  // its own navigation.
  if (router.url !== url) return;

  switch (outcome.type) {
    case 'allow':
    case 'deny':
      return;
    case 'login':
      _lastAllowedUrl = null;
      window.location.href = outcome.loginUrl;
      return;
    case 'redirect':
      _lastAllowedUrl = null;
      await router.navigateByUrl(router.parseUrl(outcome.to), { replaceUrl: true });
      return;
  }
}

async function decideNavigation(url: string, deps: GuardDeps): Promise<GuardOutcome> {
  const { configService, authService, bridge } = deps;

  let routeConfig: RouteGuardConfig;
  try {
    routeConfig = configService.getRouteGuardConfig();
  } catch {
    // If no route config is set, allow all routes
    return { type: 'allow' };
  }

  // Read the optional billing.paywallRoute and loginRoute. Tolerate config not
  // being loaded (the route guard must never throw on a missing config).
  let paywallRoute: string | undefined;
  let loginRoute: string | undefined;
  let configReturnTo: ReturnToConfig | undefined;
  try {
    const cfg = configService.getConfig();
    paywallRoute = cfg.billing?.paywallRoute;
    loginRoute = cfg.loginRoute;
    configReturnTo = cfg.returnTo;
  } catch {
    paywallRoute = undefined;
    loginRoute = undefined;
    configReturnTo = undefined;
  }

  const [pathname, search = ''] = url.split('?');
  // A Stripe/OAuth return carries these markers; the callback route resolves
  // the final destination, so the paywall gate must not pre-empt it.
  const callbackParams = new URLSearchParams(search);
  const isAuthCallbackInFlight =
    callbackParams.has('code') ||
    callbackParams.has('stripe_success') ||
    callbackParams.has('stripe_cancel');

  // Guard against a redirect loop: never redirect the in-app login route to
  // itself (it should be a public route, but be defensive).
  const effectiveLoginRoute =
    loginRoute && loginRoute !== pathname ? loginRoute : undefined;

  // TBP-629 — hand the guard the FULL attempted target, not just the pathname.
  // `?key=…` style query is part of the deep link for plenty of routes, and an
  // exported-file link that loses its query is as broken as one that loses its
  // path.
  const attempted = search ? `${pathname}?${search}` : pathname;

  // routeConfig wins over BridgeConfig so an app can keep all its routing in
  // one object, but the login route is filled in from BridgeConfig either way
  // — the app already told us where its login page is, and making them repeat
  // it under `returnTo` would be a second source of truth that can drift.
  const returnToConfig: ReturnToConfig = {
    ...configReturnTo,
    ...routeConfig.returnTo,
    loginRoute:
      routeConfig.returnTo?.loginRoute ?? configReturnTo?.loginRoute ?? loginRoute,
  };

  return getNavigationDecision(
    pathname,
    routeConfig,
    authService,
    bridge,
    paywallRoute,
    isAuthCallbackInFlight,
    effectiveLoginRoute,
    attempted,
    returnToConfig,
  );
}
