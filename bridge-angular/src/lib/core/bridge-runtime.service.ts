/**
 * Bridge core runtime — Angular port of bridge-svelte's
 * `core/bridge-runtime.ts`.
 *
 * The realtime + reactive-identity wiring that every Bridge capability (auth,
 * flags, billing, ...) rides on top of. The realtime client, per-channel auth
 * scoping, the session.snapshot fanout and the billing-family event dispatch
 * are not flag-specific — mounting the runtime once lets any capability attach
 * onto the same RealtimeClient instance.
 *
 * Svelte mounts this from `<BridgeBootstrap />`'s onMount and drives token
 * changes via a `tokenStore` subscription. Here it's an injectable service:
 * `BridgeBootstrapService` calls `start()` during `APP_INITIALIZER`, and token
 * changes are driven by an Angular `effect()` over `AuthService.tokens`.
 *
 * What `start()` does (mirrors svelte verbatim, conceptually):
 *   1. Constructs a single `RealtimeClient` using `appId` + `apiBaseUrl` from
 *      `BridgeConfigService`.
 *   2. Calls `useBridge().attachToRealtimeClient(realtime)` so the billing
 *      stores (subscription, quotas, entitlements) react to live pushes.
 *   3. Wires `setOnOpen` / `setOnClose` to mirror connection state into the
 *      reactive `realtimeStatus` signal.
 *   4. Wires `setOnSnapshot` to call `applySessionSnapshot(...)` and dispatch
 *      the snapshot through `bridgeEvents`.
 *   5. Wires `setOnUserState` so a server-side claims-change forces a token
 *      refresh on `AuthService`.
 *   6. Reacts to `AuthService.tokens`: realtime channel identity scoping
 *      (setAppId/setWorkspaceId/setUserId) + explicit reauthorize on token-only
 *      refresh + quota HTTP options reconfiguration.
 *   7. Registers the canonical billing-family event handlers via
 *      `useBridge().handle({...})` so `subscription.*` / `payment.*` /
 *      `dunning.*` / `quota.updated` / `entitlements.changed` flow into
 *      `bridgeEvents._dispatch()`.
 *   8. Exposes chainable open-subscriber set so capability bootstrappers (flag
 *      attach, etc.) layer their own behavior without clobbering core handlers.
 *
 * `start()` is idempotent — repeated calls are a no-op.
 */
import {
  Injectable,
  Injector,
  effect,
  runInInjectionContext,
  type Signal,
} from '@angular/core';
import {
  RealtimeClient,
  type RealtimeClientConfig,
  type SessionSnapshotMessage,
  type UserStateMessage,
  useBridge,
} from '@nebulr-group/bridge-auth-core';

import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { logger } from '../shared/logger';
import { applySessionSnapshot } from './snapshot-stores';
import { bridgeEvents } from './events';
import { _setRealtimeStatus } from './realtime-status';
import { setPlansLoader } from './dev-attributes';

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

export interface StartBridgeRuntimeOptions {
  /**
   * Pass-through realtime overrides. `apiBaseUrl`, `apiKey`, `appId`, and
   * `getAuthToken` are owned by the runtime and ignored here.
   */
  realtime?: Partial<
    Omit<RealtimeClientConfig, 'apiBaseUrl' | 'apiKey' | 'appId' | 'getAuthToken'>
  >;
}

@Injectable({ providedIn: 'root' })
export class BridgeRuntimeService {
  private _realtime: RealtimeClient | undefined;
  private _currentAuthToken: string | undefined;
  private _started = false;
  private _connectedOnce = false;
  // Set just before _realtime.reauthorize() so the resulting reconnect's
  // setOnOpen knows the token is already fresh and skips its proactive refresh.
  private _reauthInFlight = false;
  private _prevAuthToken: string | undefined;

  private readonly _onOpenSubs = new Set<() => void>();
  private readonly _onCloseSubs = new Set<() => void>();
  private readonly _onSnapshotSubs = new Set<(msg: SessionSnapshotMessage) => void>();
  private readonly _onUserStateSubs = new Set<(event: { reason: string }) => void>();
  private readonly _onTokensSubs = new Set<(accessToken: string | undefined) => void>();

  constructor(
    private configService: BridgeConfigService,
    private authService: AuthService,
    private injector: Injector,
  ) {}

  /**
   * Start the Bridge runtime. Idempotent — repeated calls are a no-op. Reads
   * `appId` + `apiBaseUrl` from `BridgeConfigService`. Must be called AFTER
   * `BridgeConfigService.initConfig({...})` runs (the bootstrap service
   * guarantees this ordering).
   */
  start(options: StartBridgeRuntimeOptions = {}): void {
    if (this._started) return;
    this._started = true;

    const config = this.configService.getConfig();
    const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;

    // Wire the lazy plan-catalog loader. Fetches the workspace plan catalog
    // from cloud-views; the lazy slice dedups + caches the result.
    setPlansLoader(async () => this.fetchPlans());

    this._realtime = new RealtimeClient({
      ...(options.realtime ?? {}),
      apiBaseUrl,
      apiKey: config.appId,
      appId: config.appId,
      getAuthToken: () => this._currentAuthToken,
    });

    this._realtime.setOnOpen(() => {
      _setRealtimeStatus('open');
      // Skip the proactive refresh when this reconnect was caused by our OWN
      // reauthorize() below (a token-only refresh): the token is already
      // current, and refreshing again would mint a new JWT → token change →
      // reauthorize() → reconnect → setOnOpen → refresh → … an unbounded loop
      // hammering /auth/token (~32/sec, jamming the page). Only genuine
      // external reconnects (network blips, server restarts) should catch up.
      const causedByReauthorize = this._reauthInFlight;
      this._reauthInFlight = false;
      if (this._connectedOnce && !causedByReauthorize) {
        // On reconnect, proactively refresh tokens — the client may have
        // missed a user.state_changed broadcast while offline.
        this.authService
          .maybeRefreshNow()
          .catch(() => {
            /* best-effort */
          });
      }
      this._connectedOnce = true;
      for (const fn of this._onOpenSubs) {
        try {
          fn();
        } catch {
          /* subscriber errors swallowed */
        }
      }
    });

    this._realtime.setOnClose(() => {
      _setRealtimeStatus('closed');
      for (const fn of this._onCloseSubs) {
        try {
          fn();
        } catch {
          /* subscriber errors swallowed */
        }
      }
    });

    this._realtime.setOnSnapshot((msg) => {
      try {
        applySessionSnapshot(msg.data);
      } catch {
        /* store updates shouldn't throw, defensive */
      }
      bridgeEvents._dispatch(msg);
      for (const fn of this._onSnapshotSubs) {
        try {
          fn(msg);
        } catch {
          /* subscriber errors swallowed */
        }
      }
    });

    // user.state_changed → token refresh. Fresh tokens flow back through the
    // tokens effect below and re-bind channel scopes / re-eval flags.
    this._realtime.setOnUserState(async (msg: UserStateMessage) => {
      for (const fn of this._onUserStateSubs) {
        try {
          fn({ reason: msg.reason });
        } catch {
          /* subscriber errors swallowed */
        }
      }
      try {
        await this.authService.maybeRefreshNow();
      } catch {
        /* next scheduled refresh will pick it up */
      }
    });

    // Bind billing stores to this realtime client so subscription / quotas /
    // entitlements react to live pushes.
    useBridge().attachToRealtimeClient(this._realtime);

    // Billing-family events flow through the unified bridge events surface.
    useBridge().handle({
      'subscription.plan_changed': (msg) => bridgeEvents._dispatch(msg),
      'payment.failed': (msg) => bridgeEvents._dispatch(msg),
      'payment.succeeded': (msg) => bridgeEvents._dispatch(msg),
      'subscription.created': (msg) => bridgeEvents._dispatch(msg),
      'subscription.updated': (msg) => bridgeEvents._dispatch(msg),
      'subscription.canceled': (msg) => bridgeEvents._dispatch(msg),
      'subscription.reactivated': (msg) => bridgeEvents._dispatch(msg),
      'subscription.trial_started': (msg) => bridgeEvents._dispatch(msg),
      'subscription.trial_ending_soon': (msg) => bridgeEvents._dispatch(msg),
      'subscription.trial_converted': (msg) => bridgeEvents._dispatch(msg),
      'subscription.trial_expired': (msg) => bridgeEvents._dispatch(msg),
      'dunning.entered': (msg) => bridgeEvents._dispatch(msg),
      'dunning.retry_scheduled': (msg) => bridgeEvents._dispatch(msg),
      'dunning.recovered': (msg) => bridgeEvents._dispatch(msg),
      'dunning.exhausted': (msg) => bridgeEvents._dispatch(msg),
      'quota.updated': (msg) => bridgeEvents._dispatch(msg),
      'entitlements.changed': (msg) => bridgeEvents._dispatch(msg),
    });

    // Token-driven channel scoping. Svelte uses a tokenStore subscription; here
    // an Angular effect over AuthService.tokens. The effect must run in an
    // injection context.
    const tokensSignal: Signal<ReturnType<AuthService['getToken']>> = this.authService.tokens;
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const tokens = tokensSignal();
        this.onTokensChanged(tokens?.accessToken, apiBaseUrl);
      });
    });

    // Best-effort start. RealtimeClient gracefully no-ops if the workspace's
    // `/realtime/config` returns `kind: 'noop'`.
    void this._realtime.start();
  }

  private onTokensChanged(accessToken: string | undefined, apiBaseUrl: string): void {
    const prevAuthToken = this._prevAuthToken;
    this._currentAuthToken = accessToken;
    this._prevAuthToken = accessToken;

    const config = this.configService.getConfig();
    // Quota store hydrate requests carry the current access token.
    try {
      useBridge().quotas.configure({
        apiBaseUrl,
        appId: config.appId,
        accessToken: accessToken ?? null,
      });
    } catch {
      /* quota hydration falls back to live pushes only */
    }

    if (!this._realtime) return;

    if (!accessToken) {
      // Logout — drop user + workspace channel scopes. The app channel keeps
      // its anonymous app-id auth.
      this._realtime.setUserId(undefined);
      this._realtime.setWorkspaceId(undefined);
      return;
    }

    const claims = decodeJwtPayload(accessToken);
    if (!claims) return;

    this._realtime.setAppId(typeof claims['aid'] === 'string' ? (claims['aid'] as string) : undefined);
    this._realtime.setWorkspaceId(
      typeof claims['tid'] === 'string' ? (claims['tid'] as string) : undefined,
    );
    this._realtime.setUserId(typeof claims['sub'] === 'string' ? (claims['sub'] as string) : undefined);

    // Token-only refresh (same user, new JWT): force a reauthorize so the
    // server re-validates against the new token immediately.
    if (prevAuthToken && accessToken && prevAuthToken !== accessToken) {
      // Mark this as a self-induced reconnect so setOnOpen skips its proactive
      // refresh (which would mint a new token → land back here → loop forever).
      this._reauthInFlight = true;
      void this._realtime.reauthorize();
    }

    // Notify capability bootstrappers (e.g. flag eval context) of the change.
    for (const fn of this._onTokensSubs) {
      try {
        fn(accessToken);
      } catch {
        /* subscriber errors swallowed */
      }
    }
  }

  /**
   * Fetch the workspace plan catalog (lazy plans slice loader). Rides
   * BridgeAuth's `getPlans()` (Billing 2.0) like svelte/react, rather than
   * hand-rolling a cloud-views fetch.
   */
  private async fetchPlans(): Promise<import('@nebulr-group/bridge-auth-core').Plan[]> {
    return this.authService.getBridgeAuth().getPlans();
  }

  /** Get the shared RealtimeClient. `undefined` until `start()` runs. */
  getRealtime(): RealtimeClient | undefined {
    return this._realtime;
  }

  /** Current access token cached for the realtime `getAuthToken` closure. */
  getCurrentAuthToken(): string | undefined {
    return this._currentAuthToken;
  }

  /** Subscribe to realtime `open` events. Returns an unsubscribe fn. */
  onOpen(handler: () => void): () => void {
    this._onOpenSubs.add(handler);
    return () => this._onOpenSubs.delete(handler);
  }

  /** Subscribe to realtime `close` events. Returns an unsubscribe fn. */
  onClose(handler: () => void): () => void {
    this._onCloseSubs.add(handler);
    return () => this._onCloseSubs.delete(handler);
  }

  /** Subscribe to `session.snapshot` messages. Returns an unsubscribe fn. */
  onSnapshot(handler: (msg: SessionSnapshotMessage) => void): () => void {
    this._onSnapshotSubs.add(handler);
    return () => this._onSnapshotSubs.delete(handler);
  }

  /** Subscribe to `user.state_changed` signals. Returns an unsubscribe fn. */
  onUserState(handler: (event: { reason: string }) => void): () => void {
    this._onUserStateSubs.add(handler);
    return () => this._onUserStateSubs.delete(handler);
  }

  /**
   * Subscribe to access-token changes (login / logout / refresh). Used by the
   * flags layer to push fresh JWT claims into the eval context — the Angular
   * equivalent of svelte's per-capability `tokenStore.subscribe`.
   */
  onTokens(handler: (accessToken: string | undefined) => void): () => void {
    this._onTokensSubs.add(handler);
    return () => this._onTokensSubs.delete(handler);
  }

  /** Stop the runtime. Idempotent. Flushes the realtime client. */
  async stop(): Promise<void> {
    if (this._realtime) {
      try {
        await this._realtime.stop();
      } catch {
        /* already stopped */
      }
      this._realtime = undefined;
    }
    this._currentAuthToken = undefined;
    this._started = false;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Decode a JWT payload without signature verification (client context only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
