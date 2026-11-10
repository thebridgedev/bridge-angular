/**
 * `AuthService` — Angular auth surface backed by auth-core's `BridgeAuth`.
 *
 * This is the architectural keystone of the bridge-angular ↔ auth-core
 * integration, the Angular analogue of bridge-svelte's `core/bridge-instance.ts`
 * and bridge-react's `core/bridge-instance.ts`. It owns a single `BridgeAuth`
 * instance and wires its events to Angular signals so consumers can read
 * `tokens()`, `isAuthenticated()`, `profile()`, etc. reactively.
 *
 * The native token-exchange `AuthService` that used to live here has been HARD
 * REPLACED: auth/profile/team/subscription/sdk-auth all ride auth-core now,
 * matching svelte / react / nextjs. No shims.
 *
 * The legacy public surface is preserved where consumers still depend on it
 * (`tokens`, `isLoading`, `error`, `isAuthenticated`, `login`, `logout`,
 * `handleCallback`, `getToken`, `createLoginUrl`, `maybeRefreshNow`,
 * `refreshToken`, `startAutoRefresh`, `stopAutoRefresh`) — but every method now
 * delegates to `BridgeAuth`. `BridgeAuth` owns token storage (localStorage) and
 * its own background refresh, so the old hand-rolled `setTimeout` refresh loop is
 * gone.
 */
import { Injectable, computed, signal } from '@angular/core';
import {
  BridgeAuth,
  type AppConfig,
  type AuthState,
  type BridgeAuthConfig,
  type Plan,
  type Profile,
  type SubscriptionStatus,
  type TenantUser,
  type TokenSet,
} from '@nebulr-group/bridge-auth-core';
import { logger } from '../logger';
import { billingRetryDelay } from '../../billing/billing-refresh';

export interface SubscriptionState {
  status: SubscriptionStatus | null;
  plans: Plan[] | null;
  loading: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _instance: BridgeAuth | null = null;

  // ── Reactive state (Angular signals) ──────────────────────────────────────
  private readonly _tokens = signal<TokenSet | null>(null);
  private readonly _appConfig = signal<AppConfig | null>(null);
  private readonly _profile = signal<Profile | null | undefined>(undefined);
  private readonly _authState = signal<AuthState>('unauthenticated');
  private readonly _isLoading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _tenantUsers = signal<TenantUser[]>([]);
  private readonly _ready = signal(false);
  private readonly _subscription = signal<SubscriptionState>({
    status: null,
    plans: null,
    loading: false,
    error: null,
  });

  // ── Public readonly signals ───────────────────────────────────────────────
  /** Current token set, or null. */
  readonly tokens = this._tokens.asReadonly();
  /** App-level config (SSO providers, signup/magic-link toggles) — loaded anonymously. */
  readonly appConfig = this._appConfig.asReadonly();
  /** User profile (undefined = loading, null = none, Profile = loaded). */
  readonly profile = this._profile.asReadonly();
  /** Current auth state machine value. */
  readonly authState = this._authState.asReadonly();
  /** True while bridge is still resolving the initial auth state. */
  readonly isLoading = this._isLoading.asReadonly();
  /** Last auth error message, if any. */
  readonly error = this._error.asReadonly();
  /** Tenant users available during multi-tenant selection. */
  readonly tenantUsers = this._tenantUsers.asReadonly();
  /** Whether the BridgeAuth runtime has finished bootstrapping. */
  readonly ready = this._ready.asReadonly();
  /** Subscription status + plan list. */
  readonly subscription = this._subscription.asReadonly();

  readonly isAuthenticated = computed(() => !!this._tokens()?.accessToken);
  readonly isOnboarded = computed(() => this._profile()?.onboarded ?? false);
  readonly hasMultiTenantAccess = computed(
    () => this._profile()?.multiTenantAccess ?? false,
  );

  // ── Ready gate ────────────────────────────────────────────────────────────
  private _resolveReady: (() => void) | null = null;
  private readonly _readyPromise = new Promise<void>((resolve) => {
    this._resolveReady = resolve;
  });

  // ── App config load gate ──────────────────────────────────────────────────
  private _appConfigPromise: Promise<AppConfig | null> | null = null;

  // ── Init / access ─────────────────────────────────────────────────────────

  /**
   * Construct the singleton `BridgeAuth` instance and wire its events to
   * signals. Idempotent — repeated calls return the existing instance. Called
   * once from `BridgeBootstrapService` during `APP_INITIALIZER`.
   */
  initBridge(config: BridgeAuthConfig): BridgeAuth {
    if (this._instance) {
      logger.debug('[auth] already initialized, returning existing');
      return this._instance;
    }

    this._instance = new BridgeAuth(config);

    // Seed from current auth-core state.
    const existingTokens = this._instance.getTokens();
    if (existingTokens) {
      this._tokens.set(existingTokens);
      this._instance
        .getProfile()
        .then((p) => this._profile.set(p ?? null))
        .catch((err) => logger.warn('[auth] profile fetch failed:', err));
    }
    this._authState.set(this._instance.getAuthState());
    this._isLoading.set(false);

    // Wire auth-core events → signals.
    this._instance.on('auth:login', (tokens) => {
      this._tokens.set(tokens);
      this._instance!
        .getProfile()
        .then((p) => this._profile.set(p ?? null))
        .catch((err) => logger.warn('[auth] profile fetch failed:', err));
    });

    this._instance.on('auth:logout', () => {
      this._tokens.set(null);
      this._profile.set(null);
      this.resetSubscription();
    });

    this._instance.on('auth:token-refreshed', (tokens) => {
      this._tokens.set(tokens);
    });

    this._instance.on('auth:state-change', (state) => {
      this._authState.set(state);
      if (state === 'tenant-selection') {
        this._tenantUsers.set(this._instance!.getTenantUsers());
      } else if (state === 'authenticated' || state === 'unauthenticated') {
        this._tenantUsers.set([]);
      }
    });

    this._instance.on('auth:profile', (profile) => {
      this._profile.set(profile);
    });

    this._instance.on('auth:workspace-changed', (tokens) => {
      this._tokens.set(tokens);
      this.resetSubscription();
      this._instance!
        .getProfile()
        .then((p) => this._profile.set(p ?? null))
        .catch((err) => logger.warn('[auth] profile fetch failed:', err));
    });

    this._instance.on('auth:error', (err) => {
      this._error.set(err.message);
    });

    // Load app config anonymously (drives SSO buttons, signup toggle, etc.).
    void this.ensureAppConfig();

    logger.debug('[auth] initialized');
    return this._instance;
  }

  /** The BridgeAuth singleton. Throws if `initBridge()` hasn't run. */
  getBridgeAuth(): BridgeAuth {
    if (!this._instance) {
      throw new Error(
        'BridgeAuth not initialized. Call provideBridge() in your app config.',
      );
    }
    return this._instance;
  }

  /**
   * Load the anonymous app config into the `appConfig` signal if it isn't
   * already. Idempotent — concurrent callers share the in-flight fetch.
   */
  ensureAppConfig(): Promise<AppConfig | null> {
    const existing = this._appConfig();
    if (existing) return Promise.resolve(existing);
    if (this._appConfigPromise) return this._appConfigPromise;

    this._appConfigPromise = this.getBridgeAuth()
      .getAppConfig()
      .then((cfg) => {
        this._appConfig.set(cfg);
        return cfg;
      })
      .catch((err) => {
        logger.warn('[auth] getAppConfig failed:', err);
        this._appConfigPromise = null;
        return null;
      });

    return this._appConfigPromise;
  }

  markReady(): void {
    if (this._ready()) return;
    this._ready.set(true);
    this._resolveReady?.();
  }

  /** Resolves once the BridgeAuth runtime has finished bootstrapping. */
  waitForBridge(): Promise<void> {
    return this._readyPromise;
  }

  // ── Auth actions (delegate to BridgeAuth) ─────────────────────────────────

  createLoginUrl(options: { redirectUri?: string } = {}): string {
    return this.getBridgeAuth().createLoginUrl(options);
  }

  async login(options: { redirectUri?: string } = {}): Promise<void> {
    try {
      const loginUrl = this.getBridgeAuth().createLoginUrl(options);
      if (typeof window !== 'undefined') {
        window.location.href = loginUrl;
      } else {
        throw new Error('Login not supported in this environment');
      }
    } catch (err) {
      logger.error('[auth] login failed:', err);
      throw err;
    }
  }

  async logout(): Promise<void> {
    // BridgeAuth.logout() hard-redirects to the hosted logout endpoint. Mirror
    // svelte/react: clear the local session + reset signals so subscribers
    // re-render immediately, then redirect.
    try {
      this.getBridgeAuth().clearSession();
      this._tokens.set(null);
      this._profile.set(null);
      this._authState.set('unauthenticated');
      this._tenantUsers.set([]);
      this.resetSubscription();
      await this.getBridgeAuth().logout();
    } catch (err) {
      logger.error('[auth] logout failed:', err);
      throw err;
    }
  }

  async handleCallback(code: string): Promise<void> {
    if (!code) throw new Error('No authorization code provided');
    try {
      await this.getBridgeAuth().handleCallback(code);
    } catch (err) {
      logger.error('[auth] handleCallback failed:', err);
      throw err;
    }
  }

  /**
   * Confirm a returning Stripe Checkout session with bridge-api (which verifies it
   * with Stripe server-side) and refresh tokens so the new JWT reads
   * shouldSelectPlan:false. Delegates to auth-core's shared confirmStripeCheckout()
   * (TBP-369) so the plugin's confirm logic lives in one place. Throws on a non-OK
   * response or network error — the caller (OAuth callback component) owns the
   * redirect / error UX.
   */
  async confirmStripeCheckout(sessionId: string): Promise<void> {
    await this.getBridgeAuth().confirmStripeCheckout(sessionId);
  }

  getToken(): TokenSet | null {
    return this._instance?.getTokens() ?? null;
  }

  /**
   * Refresh tokens via BridgeAuth. Kept for legacy callers (token-status demo).
   * The `_refreshTokenValue` arg is ignored — BridgeAuth reads its own stored
   * refresh token.
   */
  async refreshToken(_refreshTokenValue?: string): Promise<TokenSet | null> {
    try {
      return await this.getBridgeAuth().refreshTokens();
    } catch (err) {
      logger.error('[auth] refreshToken failed:', err);
      return null;
    }
  }

  /**
   * Best-effort eager refresh on bootstrap / realtime reconnect. BridgeAuth
   * decides internally whether a refresh is actually due. Returns whether the
   * session is (still) authenticated afterwards.
   */
  async maybeRefreshNow(): Promise<boolean> {
    const current = this.getToken();
    if (!current?.accessToken || !current?.refreshToken) {
      return !!current?.accessToken;
    }
    try {
      const next = await this.getBridgeAuth().refreshTokens();
      return !!next?.accessToken;
    } catch {
      return false;
    }
  }

  // BridgeAuth owns its own background refresh — these are no-ops kept so the
  // bootstrap service and any legacy callers don't break.
  startAutoRefresh(): void {
    /* BridgeAuth manages refresh internally */
  }

  stopAutoRefresh(): void {
    /* BridgeAuth manages refresh internally */
  }

  // ── Subscription (Billing 2.0) ────────────────────────────────────────────
  //
  // TBP-762 (svelte `core/bridge-instance.ts`) — the plan list + current plan
  // follow the billing refresh rule (`billing/billing-refresh.ts`): screens
  // call `ensureSubscription()` on mount; a renewed sign-in, a live billing
  // event and tab focus re-read it. A re-read keeps the last answer on screen
  // (no spinner flash), a failed read or an empty list is asked once more, and
  // a read started before a sign-out or workspace switch is discarded.

  private _subInflight: Promise<void> | null = null;
  private _subAgain = false;
  private _subLoadedAt = 0;
  private _subWanted = false;
  /** Bumped on sign-out and workspace switch; a read started before is discarded. */
  private _subGeneration = 0;

  private resetSubscription(): void {
    this._subGeneration += 1;
    this._subLoadedAt = 0;
    this._subscription.set({ status: null, plans: null, loading: false, error: null });
  }

  /** True once any screen has asked for the plan list / status in this session. */
  subscriptionWanted(): boolean {
    return this._subWanted;
  }

  /**
   * Re-read subscription status + plan list into the `subscription` signal.
   * Concurrent calls share one read; a call during a read queues one more.
   * Never rejects.
   */
  loadSubscription(): Promise<void> {
    this._subWanted = true;
    if (this._subInflight) {
      this._subAgain = true;
      return this._subInflight;
    }
    this._subInflight = (async () => {
      try {
        do {
          this._subAgain = false;
          await this.readSubscriptionOnce();
        } while (this._subAgain);
      } finally {
        this._subInflight = null;
      }
    })();
    return this._subInflight;
  }

  /**
   * Read only when nothing has been read yet or the last read is older than
   * `maxAgeMs`. What screens call on mount instead of fetching on their own.
   */
  ensureSubscription(maxAgeMs = 30_000): Promise<void> {
    this._subWanted = true;
    if (this._subInflight) return this._subInflight;
    if (this._subLoadedAt > 0 && Date.now() - this._subLoadedAt < maxAgeMs) return Promise.resolve();
    return this.loadSubscription();
  }

  private async readSubscriptionOnce(): Promise<void> {
    const generation = this._subGeneration;
    const current = this._subscription();
    const hasData = current.status !== null || current.plans !== null;
    if (!hasData) this._subscription.update((s) => ({ ...s, loading: true, error: null }));
    const wait = () => new Promise<void>((r) => setTimeout(r, billingRetryDelay()));

    for (let attempt = 0; ; attempt++) {
      try {
        const [status, plans] = await Promise.all([
          this.getBridgeAuth().getSubscriptionStatus(),
          this.getBridgeAuth().getPlans(),
        ]);
        if (generation !== this._subGeneration) return;
        // An empty list is more often a read that raced a change than an app
        // with no plans: ask once more before believing it.
        if ((plans?.length ?? 0) === 0 && attempt === 0) {
          await wait();
          if (generation !== this._subGeneration) return;
          continue;
        }
        this._subscription.set({ status, plans, loading: false, error: null });
        this._subLoadedAt = Date.now();
        return;
      } catch (err) {
        if (generation !== this._subGeneration) return;
        if (attempt === 0) {
          await wait();
          if (generation !== this._subGeneration) return;
          continue;
        }
        const msg = err instanceof Error ? err.message : 'Failed to load subscription';
        logger.warn('[auth] subscription read failed:', msg);
        const latest = this._subscription();
        if (latest.status !== null || latest.plans !== null) {
          // Keep the last good answer on screen; the next trigger re-reads.
          this._subscription.update((s) => ({ ...s, loading: false }));
        } else {
          this._subscription.update((s) => ({ ...s, loading: false, error: msg }));
        }
        return;
      }
    }
  }
}
