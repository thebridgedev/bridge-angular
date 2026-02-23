/**
 * Environment configuration for bridge-angular Playwright E2E tests.
 */

export interface EnvironmentConfig {
  baseUrl: string;
  authBaseUrl?: string;
  cloudViewsUrl?: string;
  testDataApiUrl: string;
  testDataApiKey: string;
  appId: string;
  appDomain: string;
  name: 'local' | 'stage' | 'prod';
  isContainer: boolean;
}

function isRunningInContainer(): boolean {
  if (process.env.DOCKER === 'true' || process.env.IN_DOCKER === 'true') {
    return true;
  }
  try {
    require('fs').accessSync('/.dockerenv');
    return true;
  } catch {
    // Not in Docker
  }
  try {
    const cgroup = require('fs').readFileSync('/proc/self/cgroup', 'utf8');
    return cgroup.includes('docker') || cgroup.includes('containerd');
  } catch {
    // Not available
  }
  return false;
}

function getServiceUrl(
  serviceName: string,
  containerPort: number,
  hostPort: number,
  isContainer: boolean,
): string {
  if (isContainer) {
    return `http://${serviceName}:${containerPort}`;
  }
  return `http://localhost:${hostPort}`;
}

export function getEnvironmentConfig(environment: 'local' | 'stage' | 'prod'): EnvironmentConfig {
  const testDataApiKey = requireEnv('PLAYWRIGHT_TEST_API_KEY');
  const appDomain = process.env.APP_DOMAIN || 'BRIDGE_ANGULAR_TEST_DASHBOARD';
  const isContainer = isRunningInContainer();

  const baseUrl = isContainer
    ? getServiceUrl('bridge-angular', 3001, 3008, isContainer)
    : process.env.LOCAL_BASE_URL || 'http://localhost:3001';

  const appId = requireEnv('BRIDGE_TEST_APP_ID');

  switch (environment) {
    case 'local': {
      const authBaseUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer) + '/auth'
        : process.env.LOCAL_AUTH_BASE_URL || 'http://localhost:3200/auth';

      const cloudViewsUrl = isContainer
        ? getServiceUrl('bridge-cloud-views', 3000, 3091, isContainer)
        : process.env.LOCAL_CLOUD_VIEWS_URL || 'http://localhost:3200/cloud-views';

      const testDataApiUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer)
        : process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';

      return {
        name: 'local',
        baseUrl,
        authBaseUrl,
        cloudViewsUrl,
        testDataApiUrl,
        testDataApiKey,
        appId,
        appDomain,
        isContainer,
      };
    }

    case 'stage':
      return {
        name: 'stage',
        baseUrl,
        authBaseUrl: requireEnv('STAGE_AUTH_BASE_URL'),
        cloudViewsUrl: requireEnv('STAGE_CLOUD_VIEWS_URL'),
        testDataApiUrl: requireEnv('STAGE_TEST_DATA_API_URL'),
        testDataApiKey,
        appId,
        appDomain,
        isContainer: false,
      };

    case 'prod':
      return {
        name: 'prod',
        baseUrl,
        testDataApiUrl: requireEnv('PROD_TEST_DATA_API_URL'),
        testDataApiKey,
        appId,
        appDomain,
        isContainer: false,
      };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set. ` +
        `Check your config/.env.test.local file or CI secrets.`,
    );
  }
  return value;
}

export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function isCI(): boolean {
  return !!process.env.CI;
}

export function getCurrentEnvironment(): 'local' | 'stage' | 'prod' {
  const projectName = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (projectName.includes('prod')) return 'prod';
  if (projectName.includes('stage')) return 'stage';
  return 'local';
}
