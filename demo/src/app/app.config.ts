import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  bridgeInterceptor,
  provideBridge,
  type BridgeConfig,
  type RouteGuardConfig,
} from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

/**
 * The app id this demo boots with.
 *
 * `localStorage['bridge:appId']` wins over the environment file, mirroring
 * bridge-svelte's demo (`demo/src/routes/+layout.ts`). The Playwright suite
 * resolves the app id at run time from the test-data API and seeds it here
 * (e2e/playwright/global-setup.ts), so a clean checkout runs without anyone
 * writing an id into a tracked `environment.test.<mode>.ts` first — and each
 * Playwright worker can boot the demo against its own app (TBP-721).
 * `environment.bridgeAppId` stays the fallback for serving the demo by hand.
 */
function resolveAppId(): string {
  try {
    const stored = globalThis.localStorage?.getItem('bridge:appId');
    if (stored) return stored;
  } catch {
    // Storage unavailable (privacy mode, SSR) — fall back to the environment.
  }
  return environment.bridgeAppId;
}

const bridgeConfig: BridgeConfig = {
  appId: resolveAppId(),
  // Unset in the test environments: the SDK then derives
  // `<origin>/auth/oauth-callback`, right for whichever port the demo serves on.
  ...(environment.bridgeCallbackUrl ? { callbackUrl: environment.bridgeCallbackUrl } : {}),
  debug: environment.bridgeDebug,
  // In-app sign-in: the pages bridgeAuthRoutes() serves (matches bridge-svelte's demo).
  loginRoute: '/auth/login',
  // Demo-only: an onboarding paywall at /welcome (matches bridge-svelte's demo
  // +layout.ts). Without it the paywall is /subscription/plan.
  billing: { paywallRoute: '/welcome' },
  ...(environment.authBaseUrl ? { authBaseUrl: environment.authBaseUrl } : {}),
  ...(environment.cloudViewsUrl ? { cloudViewsUrl: environment.cloudViewsUrl } : {}),
  ...(environment.apiBaseUrl ? { apiBaseUrl: environment.apiBaseUrl } : {}),
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: /^\/docs($|\/)/, public: true },
    { match: '/flag-demo', public: true },
    { match: '/flag-context-demo', public: true },
    // The /welcome paywall is public, like svelte's demo.
    { match: '/welcome', public: true },
    {
      match: '/beta*',
      featureFlag: 'test-global-admin-access',
      redirectTo: '/',
      public: true,
    },
  ],
  defaultAccess: 'protected',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // The app's own API calls carry the user's token, and a plan-limit 402
    // opens the upgrade dialog.
    provideHttpClient(withInterceptors([bridgeInterceptor])),
    provideBridge(bridgeConfig, routeConfig),
  ],
};
