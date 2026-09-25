export const environment = {
  // Surfaced by the navbar env pill; global-setup asserts it against the
  // Playwright project (TBP-721).
  name: 'local' as 'local' | 'stage' | 'prod' | 'development',
  // Fallback only: global-setup seeds each worker's app id as localStorage
  // `bridge:appId`, which app.config.ts prefers over this value.
  bridgeAppId: '6a3143941daa84aee178706d',
  // Unset: the SDK derives `<origin>/auth/oauth-callback` for the harness port.
  bridgeCallbackUrl: undefined as string | undefined,
  bridgeDebug: true,
  authBaseUrl: 'http://localhost:3200/auth' as string | undefined,
  cloudViewsUrl: 'http://localhost:3200/cloud-views' as string | undefined,
  apiBaseUrl: 'http://localhost:3200' as string | undefined,
};
