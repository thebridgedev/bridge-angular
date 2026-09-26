export const environment = {
  name: 'development' as 'local' | 'stage' | 'prod' | 'development',
  bridgeAppId: '',
  bridgeCallbackUrl: 'http://localhost:3001/auth/oauth-callback' as string | undefined,
  bridgeDebug: true,
  authBaseUrl: undefined as string | undefined,
  cloudViewsUrl: undefined as string | undefined,
  apiBaseUrl: undefined as string | undefined,
};
