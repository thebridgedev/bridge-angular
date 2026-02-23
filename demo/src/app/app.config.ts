import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBridge, type BridgeConfig, type RouteGuardConfig } from '@nebulr-group/bridge-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const bridgeConfig: BridgeConfig = {
  appId: environment.bridgeAppId,
  callbackUrl: environment.bridgeCallbackUrl,
  debug: environment.bridgeDebug,
  ...(environment.authBaseUrl ? { authBaseUrl: environment.authBaseUrl } : {}),
  ...(environment.cloudViewsUrl ? { cloudViewsUrl: environment.cloudViewsUrl } : {}),
  ...(environment.teamManagementUrl
    ? { teamManagementUrl: environment.teamManagementUrl }
    : {}),
};

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/login', public: true },
    { match: /^\/auth\/oauth-callback$/, public: true },
    { match: /^\/docs($|\/)/, public: true },
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
