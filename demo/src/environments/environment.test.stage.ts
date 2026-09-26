// Demo config for E2E tests against the STAGE Bridge backend.
// Served by `ng serve --configuration=test-stage`, i.e. `npm run test:e2e:stage`.
//
// Every key is written out on purpose, including the ones left empty (TBP-721).
// Anything this file does not set falls back to an SDK default, and every SDK
// default is PRODUCTION — a stage app id sent to a production endpoint answers
// "[GraphQL] App not found". Silence here is not "use stage"; it is "use prod".
export const environment = {
  // Surfaced by the navbar env pill. global-setup asserts it against the
  // Playwright project, so a demo left serving another configuration on the
  // harness port fails setup instead of quietly measuring another backend.
  name: 'stage' as 'local' | 'stage' | 'prod' | 'development',

  // Deliberately EMPTY. global-setup resolves each worker's app id from the
  // stage test-data API and seeds it as localStorage `bridge:appId`, which
  // app.config.ts prefers over this value. To serve this demo by hand outside
  // Playwright, put a stage app id here (and do not commit it).
  bridgeAppId: '',

  // Unset: the SDK derives `<origin>/auth/oauth-callback`, which is right for
  // whatever port the harness serves on (HARNESS_PORT). A hard-coded
  // localhost:3001 sent hosted-login callbacks to whatever else owns :3001.
  bridgeCallbackUrl: undefined as string | undefined,
  bridgeDebug: true,

  // The one URL the SDK actually routes on: auth-core derives its auth
  // endpoints from it, and it is the realtime + feature-flag base. Without it
  // login, API and realtime all go to https://api.thebridge.dev.
  apiBaseUrl: 'https://api-stage.thebridge.dev' as string | undefined,
  authBaseUrl: 'https://api-stage.thebridge.dev/auth' as string | undefined,
  cloudViewsUrl: 'https://api-stage.thebridge.dev/cloud-views' as string | undefined,

  // NOT settable: the hosted login portal. bridge-angular's BridgeConfig has no
  // `hostedUrl` and does not forward one to auth-core, so hosted login, signup
  // and logout always go to https://auth.thebridge.dev (production), where a
  // stage app id is unknown. That is why the stage suite authenticates through
  // the in-app SDK login (/auth/login); the specs that drive the hosted portal
  // itself cannot pass on stage until the SDK can be pointed at
  // https://auth-stage.thebridge.dev (TBP-721).
};
