import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
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
  | { type: 'login'; loginUrl: string }
  | { type: 'redirect'; to: string };

async function getNavigationDecision(
  pathname: string,
  config: RouteGuardConfig,
  authService: AuthService,
  bridge: BridgeService,
  paywallRoute?: string,
  isAuthCallbackInFlight = false,
  loginRoute?: string,
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
    if (loginRoute) {
      logger.debug(
        `[route-guard] path ${pathname} is protected and user is not authenticated; redirecting to in-app loginRoute ${loginRoute}`,
      );
      return { type: 'redirect', to: loginRoute };
    }
    logger.debug(`[route-guard] path ${pathname} is protected and user is not authenticated`);
    return { type: 'login', loginUrl: authService.createLoginUrl() };
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
      const status = await authService.getBridgeAuth().getSubscriptionStatus();
      if (status?.shouldSelectPlan === true && status?.paymentsAutoRedirect !== false) {
        logger.debug(`[route-guard] paywall redirect ${pathname} → ${paywallRoute}`);
        return { type: 'redirect', to: paywallRoute };
      }
    } catch (err) {
      logger.warn('[route-guard] paywall subscription-status check failed; allowing', err);
    }
  }

  return { type: 'allow' };
}

/**
 * Angular functional route guard that replicates bridge-svelte's route-guard.ts logic.
 * Apply via canActivateChild on a parent route to protect all child routes.
 */
export function bridgeAuthGuard(): CanActivateFn {
  return async (_route, state) => {
    const configService = inject(BridgeConfigService);
    const authService = inject(AuthService);
    const bridge = inject(BridgeService);
    const router = inject(Router);

    let routeConfig: RouteGuardConfig;
    try {
      routeConfig = configService.getRouteGuardConfig();
    } catch {
      // If no route config is set, allow all routes
      return true;
    }

    // Read the optional billing.paywallRoute and loginRoute. Tolerate config not
    // being loaded (the route guard must never throw on a missing config).
    let paywallRoute: string | undefined;
    let loginRoute: string | undefined;
    try {
      const cfg = configService.getConfig();
      paywallRoute = cfg.billing?.paywallRoute;
      loginRoute = cfg.loginRoute;
    } catch {
      paywallRoute = undefined;
      loginRoute = undefined;
    }

    const [pathname, search = ''] = state.url.split('?');
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

    const decision = await getNavigationDecision(
      pathname,
      routeConfig,
      authService,
      bridge,
      paywallRoute,
      isAuthCallbackInFlight,
      effectiveLoginRoute,
    );

    switch (decision.type) {
      case 'allow':
        return true;
      case 'login':
        window.location.href = decision.loginUrl;
        return false;
      case 'redirect':
        return router.createUrlTree([decision.to]);
    }
  };
}
