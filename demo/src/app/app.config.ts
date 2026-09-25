import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
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
  callbackUrl: environment.bridgeCallbackUrl,
  debug: environment.bridgeDebug,
  // Paywall: bounce an authenticated no-plan tenant to /welcome before a
  // protected page renders (matches bridge-svelte's demo +layout.ts).
  billing: { paywallRoute: '/welcome', paymentErrorRoute: '/payment-error' },
  ...(environment.authBaseUrl ? { authBaseUrl: environment.authBaseUrl } : {}),
  ...(environment.cloudViewsUrl ? { cloudViewsUrl: environment.cloudViewsUrl } : {}),
  ...(environment.apiBaseUrl ? { apiBaseUrl: environment.apiBaseUrl } : {}),
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/login', public: true },
    { match: /^\/auth\/oauth-callback$/, public: true },
    // SDK auth — in-app auth UI; all public (the whole point is to render
    // unauthenticated). `set-password` / `setup-passkey` carry a :token segment.
    { match: '/auth/login', public: true },
    { match: '/auth/signup', public: true },
    { match: '/auth/magic-link', public: true },
    { match: '/auth/forgot-password', public: true },
    { match: /^\/auth\/set-password($|\/)/, public: true },
    { match: /^\/auth\/setup-passkey($|\/)/, public: true },
    { match: /^\/docs($|\/)/, public: true },
    { match: '/flag-demo', public: true },
    { match: '/flag-context-demo', public: true },
    // Paywall destination + payment-error landing must be PUBLIC, otherwise the
    // paywall redirect would loop (redirecting to /welcome which itself bounces).
    { match: '/welcome', public: true },
    { match: '/payment-error', public: true },
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
    provideBridge(bridgeConfig, routeConfig),
  ],
};
