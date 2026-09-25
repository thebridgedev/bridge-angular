// Demo config for E2E tests against the PRODUCTION Bridge backend.
// Served by `ng serve --configuration=test-prod`, i.e. `npm run test:e2e:prod`.
//
// No endpoint URLs on purpose: the SDK resolves its own production endpoints,
// which mirrors the real user experience.
export const environment = {
  // Surfaced by the navbar env pill; global-setup asserts it against the
  // Playwright project (TBP-721).
  name: 'prod' as 'local' | 'stage' | 'prod' | 'development',

  // Deliberately EMPTY — seeded per worker by global-setup as localStorage
  // `bridge:appId`, which app.config.ts prefers over this value.
  bridgeAppId: '',

  // Unset: the SDK derives `<origin>/auth/oauth-callback` for the harness port.
  bridgeCallbackUrl: undefined as string | undefined,
  bridgeDebug: true,
  apiBaseUrl: undefined as string | undefined,
  authBaseUrl: undefined as string | undefined,
  cloudViewsUrl: undefined as string | undefined,
};
