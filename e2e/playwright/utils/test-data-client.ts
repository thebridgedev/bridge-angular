import { EnvironmentConfig } from '../config/environments';

export interface PlaywrightTestAccount {
  email: string;
  password: string;
  userId: string;
  tenantId: string;
  appId: string;
}

export interface CreateTestAccountOptions {
  email?: string;
  password?: string;
  tenantName?: string;
  firstName?: string;
  lastName?: string;
}

export class TestDataClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly appDomain: string;

  constructor(config: EnvironmentConfig) {
    this.baseUrl = config.testDataApiUrl;
    this.apiKey = config.testDataApiKey;
    this.appDomain = config.appDomain;
  }

  async createTestAccount(
    options?: CreateTestAccountOptions,
  ): Promise<PlaywrightTestAccount> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain, ...options }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create test account: ${response.status} ${error}`);
    }

    return response.json();
  }

  async removeTestAccount(email: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ email, appDomain: this.appDomain }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to remove test account: ${response.status} ${error}`);
    }
  }

  async healthCheck(): Promise<{ success: boolean; diagnostics?: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/account/test/playwright/health`,
        {
          method: 'GET',
          headers: { 'x-playwright-api-key': this.apiKey },
        },
      );

      if (!response.ok) {
        return { success: false, diagnostics: `Health check failed: ${response.status}` };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, diagnostics: error.message };
    }
  }

  async setupTestApp(
    domain: string,
    appName: string,
    ownerEmail: string,
    ownerPassword?: string,
    appUrl?: string,
  ): Promise<{
    appId: string;
    domain: string;
    tenantId: string;
    userId: string;
    email: string;
    message: string;
  }> {
    const response = await fetch(
      `${this.baseUrl}/account/test/playwright/setup-test-app`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-playwright-api-key': this.apiKey,
        },
        body: JSON.stringify({ domain, appName, ownerEmail, ownerPassword, appUrl }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to setup test app: ${response.status} ${error}`);
    }

    return response.json();
  }

  async purgeTestAccounts(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to purge test accounts: ${response.status} ${error}`);
    }

    const result = await response.json();
    return result.purgedCount;
  }

  // ── Billing 2.0 / subscription test helpers (ported from bridge-svelte) ─────

  /** Configure the test app (Stripe, payments-auto-redirect, SSO toggles, …). */
  async configureApp(config: {
    paymentsAutoRedirect?: boolean;
    stripeEnabled?: boolean;
    redirectUris?: string[];
    defaultCallbackUri?: string;
    stripePublicKey?: string;
    stripeSecretKey?: string;
    currency?: string;
    googleSsoEnabled?: boolean;
    linkedinSsoEnabled?: boolean;
    azureAdSsoEnabled?: boolean;
    facebookSsoEnabled?: boolean;
    githubSsoEnabled?: boolean;
    appleSsoEnabled?: boolean;
  }): Promise<{ appId: string; message: string }> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/configure-app`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain, ...config }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to configure app: ${response.status} ${error}`);
    }

    return response.json();
  }

  /** Create a plan in the app for test scenarios. */
  async createPlan(planData: {
    key?: string;
    name?: string;
    description?: string;
    trial?: boolean;
    trialDays?: number;
    prices?: Array<{ amount: number; currency: string; recurrenceInterval: string }>;
  }): Promise<{ planId: string; key: string; name: string }> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/create-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain, ...planData }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create plan: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Idempotently ensures a plan exists (create-if-absent).
   *
   * When the plan already exists, bridge-api returns it WITHOUT re-running the
   * Stripe price sync/archive sweep — so a STABLE, reusable plan's Stripe price
   * is synced exactly once and reused on every later run. This is what makes the
   * welcome-paywall checkout deterministic (no create-then-checkout price race).
   */
  async ensurePlan(planData: {
    key: string;
    name?: string;
    description?: string;
    trial?: boolean;
    trialDays?: number;
    prices?: Array<{ amount: number; currency: string; recurrenceInterval: string }>;
  }): Promise<{ planId: string; key: string; name: string; created: boolean }> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/ensure-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain, ...planData }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to ensure plan: ${response.status} ${error}`);
    }

    return response.json();
  }

  /** Delete a plan by key for test cleanup. */
  async deletePlan(planKey: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/delete-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({ appDomain: this.appDomain, key: planKey }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete plan: ${response.status} ${error}`);
    }
  }

  /** Set a tenant's selected plan directly via the API (bypasses checkout). */
  async setTenantPlan(
    tenantId: string,
    planKey: string,
    currency: string = 'usd',
    recurrenceInterval: string = 'month',
  ): Promise<{ shouldSelectPlan: boolean; shouldSetupPayments: boolean; trial: boolean }> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/set-tenant-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        appDomain: this.appDomain,
        tenantId,
        planKey,
        currency,
        recurrenceInterval,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to set tenant plan: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Generates a fresh password reset link for a test account, letting E2E tests
   * navigate to /auth/set-password/[token] without email interception.
   * Mirrors bridge-svelte's `getPasswordResetLink`.
   */
  async getPasswordResetLink(
    email: string,
    originUrl?: string,
    appDomain?: string,
  ): Promise<{ link: string; token: string }> {
    const params = new URLSearchParams({ email, appDomain: appDomain ?? this.appDomain });
    if (originUrl) params.set('originUrl', originUrl);

    const response = await fetch(
      `${this.baseUrl}/account/test/playwright/password-reset-link?${params}`,
      {
        method: 'GET',
        headers: {
          'x-playwright-api-key': this.apiKey,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get password reset link: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Retrieves the signup verification link for a Playwright test account — the
   * link that would normally be emailed after self-service signup.
   * Mirrors bridge-svelte's `getSignupVerificationLink`.
   */
  async getSignupVerificationLink(
    email: string,
  ): Promise<{ link: string; token: string }> {
    const params = new URLSearchParams({ email, appDomain: this.appDomain });
    const response = await fetch(
      `${this.baseUrl}/account/test/playwright/signup-verification-link?${params}`,
      {
        method: 'GET',
        headers: {
          'x-playwright-api-key': this.apiKey,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get signup verification link: ${response.status} ${error}`);
    }

    return response.json();
  }
}

export function createTestDataClientFromEnv(): TestDataClient {
  const projectName = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  let testDataApiUrl: string;

  if (projectName.includes('prod')) {
    testDataApiUrl = process.env.PROD_TEST_DATA_API_URL || '';
  } else if (projectName.includes('stage')) {
    testDataApiUrl = process.env.STAGE_TEST_DATA_API_URL || '';
  } else {
    testDataApiUrl = process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
  }

  const testDataApiKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  const appDomain = process.env.APP_DOMAIN || 'BRIDGE_ANGULAR_TEST_DASHBOARD';

  if (!testDataApiKey) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY environment variable is required');
  }

  return new TestDataClient({
    name: 'local',
    baseUrl: '',
    testDataApiUrl,
    testDataApiKey,
    appId: process.env.BRIDGE_TEST_APP_ID || '',
    appDomain,
    isContainer: false,
  });
}
