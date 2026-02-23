import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { BridgeConfigService } from '../config/bridge-config.service';
import { FeatureFlagService } from '../shared/services/feature-flag.service';
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

async function evaluateFlagRequirement(
  req: FlagRequirement,
  featureFlagService: FeatureFlagService,
): Promise<boolean> {
  if (typeof req === 'string') {
    return featureFlagService.isFeatureEnabled(req);
  }
  if ('any' in req) {
    const results = await Promise.all(
      req.any.map((f) => featureFlagService.isFeatureEnabled(f)),
    );
    return results.some(Boolean);
  }
  if ('all' in req) {
    const results = await Promise.all(
      req.all.map((f) => featureFlagService.isFeatureEnabled(f)),
    );
    return results.every(Boolean);
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
  featureFlagService: FeatureFlagService,
): Promise<NavigationDecision> {
  const authenticated = authService.isAuthenticated();
  const isPublic = isPublicRoute(pathname, config);

  logger.debug(`[route-guard] getNavigationDecision`, {
    pathname,
    isPublic,
    authenticated,
  });

  // Redirect to login if protected and not authenticated
  if (!isPublic && !authenticated) {
    logger.debug(`[route-guard] path ${pathname} is protected and user is not authenticated`);
    return { type: 'login', loginUrl: authService.createLoginUrl() };
  }

  // Check feature flag restriction
  const rule = findMatchingRule(pathname, config);
  if (rule?.featureFlag) {
    const ok = await evaluateFlagRequirement(rule.featureFlag, featureFlagService);
    logger.debug(
      `[route-guard] path ${pathname} is restricted by bridge feature flag ${rule.featureFlag} and flag requirement evaluated to ${ok}`,
    );
    if (!ok) return { type: 'redirect', to: rule.redirectTo ?? '/' };
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
    const featureFlagService = inject(FeatureFlagService);
    const router = inject(Router);

    let routeConfig: RouteGuardConfig;
    try {
      routeConfig = configService.getRouteGuardConfig();
    } catch {
      // If no route config is set, allow all routes
      return true;
    }

    const pathname = state.url.split('?')[0];
    const decision = await getNavigationDecision(
      pathname,
      routeConfig,
      authService,
      featureFlagService,
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
