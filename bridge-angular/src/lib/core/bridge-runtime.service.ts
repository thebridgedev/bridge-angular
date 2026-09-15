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
  type RealtimeStatus,
  type SessionSnapshotMessage,
  type UserStateMessage,
  useBridge,
} from '@nebulr-group/bridge-auth-core';

import { BridgeConfigService } from '../config/bridge-config.service';
import { AuthService } from '../shared/services/auth.service';
import { logger } from '../shared/logger';
import {
  applyEntitlementsChanged,
  applySessionSnapshot,
  applySubscriptionPlanChanged,
  tenantEntitlementsSignal,
  tenantSubscriptionSignal,
} from './snapshot-stores';
import { bridgeEvents } from './events';
import { _setRealtimeStatus, _setRealtimeStatusDetail } from './realtime-status';
import { setPlansLoader } from './dev-attributes';
import { notifyAllFlagsChanged } from '../flags/registry';
import {
  clearPendingAuthorizationChange,
  pendingAuthorizationChange,
  trackAuthorizationChange,
} from './pending-authorization-change';

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

/**
 * Why a route verdict may have changed without a flag changing (TBP-654): a
 * plan change, an entitlements change, a server-side user state change, or a
 * new access token (sign-in, refresh, sign-out).
 */
export type BridgeAuthorizationChangeReason =
  | 'subscription.plan_changed'
  | 'entitlements.changed'
  | 'user.state_changed'
  | 'token'
  /** TBP-660 — the post-reconnect catch-up found state the live channel missed. */
  | 'reconnect';

export interface StartBridgeRuntimeOptions {
  /**
   * Pass-through realtime overrides. `apiBaseUrl`, `apiKey`, `appId`, and
   * `getAuthToken` are owned by the runtime and ignored here.
   */
  realtime?: Partial<
    Omit<RealtimeClientConfig, 'apiBaseUrl' | 'apiKey' | 'appId' | 'getAuthToken'>
  >;
  /**
   * HTTP used by the post-reconnect catch-up (TBP-660). Defaults to the global
   * `fetch`; tests pass a stub.
   */
  fetch?: typeof fetch;
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
  // TBP-660 — HTTP for the post-reconnect catch-up, and a sequence number so a
  // slow catch-up that a newer reconnect superseded cannot write old state back.
  private _fetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  private _catchUpSeq = 0;
  private _apiBaseUrl = DEFAULT_API_BASE_URL;

  private readonly _onOpenSubs = new Set<() => void>();
  private readonly _onCloseSubs = new Set<() => void>();
  private readonly _onSnapshotSubs = new Set<(msg: SessionSnapshotMessage) => void>();
  private readonly _onUserStateSubs = new Set<(event: { reason: string }) => void>();
  private readonly _onTokensSubs = new Set<(accessToken: string | undefined) => void>();
  // TBP-644 — full realtime status (state + reason + whose side + retrying).
  private readonly _onStatusSubs = new Set<(status: RealtimeStatus) => void>();
  // TBP-654 — anything that can change a route verdict without a flag changing.
  private readonly _onAuthorizationChangeSubs = new Set<
    (reason: BridgeAuthorizationChangeReason) => void
  >();

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
    this._apiBaseUrl = apiBaseUrl;
    if (options.fetch) this._fetch = options.fetch;

    // Wire the lazy plan-catalog loader. Fetches the workspace plan catalog
    // from cloud-views; the lazy slice dedups + caches the result.
    setPlansLoader(async () => this.fetchPlans());

    // TBP-644 — seed the token synchronously. The tokens effect below first
    // runs on a later tick; seeding here means start() connects with the
    // session that already exists, and that first effect run is not mistaken
    // for a sign-in (which would reauthorize a connection still being made).
    const initialToken = this.authService.tokens()?.accessToken ?? undefined;
    this._currentAuthToken = initialToken;
    this._prevAuthToken = initialToken;

    this._realtime = new RealtimeClient({
      ...(options.realtime ?? {}),
      apiBaseUrl,
      apiKey: config.appId,
      appId: config.appId,
      getAuthToken: () => this._currentAuthToken,
      // TBP-644 — a refused connection gets ONE session refresh per episode
      // (auth-core enforces the once) and reconnects with the new token
      // instead of parking. A signed-out session has nothing to refresh. Loop
      // safety: the refreshed token lands in the tokens effect, whose
      // reauthorize() is a no-op while that episode is still connecting, and
      // the reconnect it produces is flagged self-induced so setOnOpen does
      // not refresh a second time.
      refreshAuthToken:
        options.realtime?.refreshAuthToken ??
        (async () => {
          if (!this._currentAuthToken) return undefined;
          try {
            const tokens = await this.authService.getBridgeAuth().refreshTokens();
            return tokens?.accessToken ?? undefined;
          } catch {
            return undefined;
          }
        }),
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
      // TBP-660 — AppSync has no replay: anything published while the socket
      // was down or being replaced is gone. That includes the reconnect OUR
      // reauthorize() causes after user.state_changed → token refresh — the
      // exact window in which the server publishes subscription.plan_changed,
      // so a live plan change was lost in ~1 of 8 stage runs. Re-read billing
      // state after every reconnect, reauthorize-caused or not. Loop-safe: the
      // catch-up only GETs state and never touches the token.
      if (this._connectedOnce) void this.catchUpAfterReconnect();
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

    // TBP-575 / TBP-644 — connected, handshaken, and subscribed to nothing.
    // Distinct from 'closed': no reconnect is coming, but nothing will arrive.
    // bridge-svelte wired this; angular never did, so a deaf connection read
    // as 'open' here. Guarded: an older auth-core has no such hook.
    this._realtime.setOnDegraded?.(() => {
      _setRealtimeStatus('degraded');
    });

    // TBP-644 — the full status: why the connection is not working, whose side
    // the fault is on, and whether it is still retrying. Guarded for the same
    // reason as setOnDegraded.
    this._realtime.setOnStatusChange?.((status) => {
      _setRealtimeStatusDetail(status);
      // A parked client never opens, so a reauthorize that ended in a refusal
      // must not leave the self-induced flag set for the next genuine reconnect.
      if (status.state === 'unauthorized') this._reauthInFlight = false;
      for (const fn of this._onStatusSubs) {
        try {
          fn(status);
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
      // TBP-654 — role / plan / attribute changes can flip a route verdict.
      // This starts the token refresh (or joins the one a preceding
      // plan_changed started).
      this.authorizationChanged('user.state_changed');
      for (const fn of this._onUserStateSubs) {
        try {
          fn({ reason: msg.reason });
        } catch {
          /* subscriber errors swallowed */
        }
      }
      // Never rejects; a failed refresh is picked up by the next scheduled one.
      await pendingAuthorizationChange();
      // The refresh this joined may have been minted BEFORE the server bumped
      // the token version this message announces: a plan_changed that arrived
      // first started it, and the server bumps after publishing plan_changed.
      // Such a token carries the new plan but is `TOKEN_VERSION_STALE` for
      // every version-checked endpoint (`/billing/state` 401 → "Subscription
      // unavailable" on stage). One follow-up refresh, only when the token we
      // ended up with is behind the announced version — so it cannot loop, and
      // an older server that sends no version keeps the single refresh.
      const announced = (msg as { tokenVersion?: unknown }).tokenVersion;
      if (typeof announced === 'number') {
        const tv = decodeJwtPayload(this._currentAuthToken ?? '')?.['tv'];
        if (typeof tv === 'number' && tv < announced) {
          await this.refreshForAuthorizationChange();
        }
      }
    });

    // Bind billing stores to this realtime client so subscription / quotas /
    // entitlements react to live pushes.
    useBridge().attachToRealtimeClient(this._realtime);

    // Billing-family events flow through the unified bridge events surface.
    //
    // TBP-644 — the two pushes that carry the complete new value also move the
    // `bridge.tenant.*` signals, which were otherwise written only by
    // `session.snapshot`. A plan change never re-sends a snapshot, so without
    // this an upgraded app kept rendering the old plan until a reload. The
    // signal is patched BEFORE dispatch so a `bridge.events` handler that reads
    // `bridge.tenant.subscription()` already sees the new plan. Lifecycle events
    // are deliberately not mirrored: their payloads carry no status.
    useBridge().handle({
      'subscription.plan_changed': (msg) => {
        try { applySubscriptionPlanChanged(msg); } catch { /* signal updates shouldn't throw, defensive */ }
        this.authorizationChanged('subscription.plan_changed');
        bridgeEvents._dispatch(msg);
      },
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
      'entitlements.changed': (msg) => {
        // Only the payload-carrying variant has a map; the signal-only one is a no-op here.
        try { applyEntitlementsChanged(msg as { entitlements?: unknown }); } catch { /* defensive */ }
        this.authorizationChanged('entitlements.changed');
        bridgeEvents._dispatch(msg);
      },
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

  /**
   * TBP-644 — the realtime connection must be re-authorized whenever the token
   * VALUE changes: rotation (A → B), but also first sign-in (none → A) and
   * sign-out (A → none). Keying this on rotation only meant a session that
   * signed in after bootstrap kept the anonymous connection — or stayed parked
   * after a refusal — until something else reconnected it. Flagged
   * self-induced so setOnOpen skips its catch-up refresh (see the loop note
   * there): the token we reconnect with is already current.
   */
  private reauthorizeForTokenChange(): void {
    if (!this._realtime) return;
    this._reauthInFlight = true;
    void this._realtime.reauthorize();
  }

  private onTokensChanged(accessToken: string | undefined, apiBaseUrl: string): void {
    const prevAuthToken = this._prevAuthToken;
    this._currentAuthToken = accessToken;
    this._prevAuthToken = accessToken;
    const tokenChanged = prevAuthToken !== accessToken;

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

    if (this._realtime) {
      if (!accessToken) {
        // Logout — drop user + workspace channel scopes. The app channel keeps
        // its anonymous app-id auth.
        this._realtime.setUserId(undefined);
        this._realtime.setWorkspaceId(undefined);
      } else {
        const claims = decodeJwtPayload(accessToken);
        if (claims) {
          this._realtime.setAppId(
            typeof claims['aid'] === 'string' ? (claims['aid'] as string) : undefined,
          );
          this._realtime.setWorkspaceId(
            typeof claims['tid'] === 'string' ? (claims['tid'] as string) : undefined,
          );
          this._realtime.setUserId(
            typeof claims['sub'] === 'string' ? (claims['sub'] as string) : undefined,
          );
        }
      }
      // setUserId is a no-op when the user is unchanged (token-only refresh),
      // and a setter-driven reconnect waits out a backoff and cannot lift a
      // parked refusal — so reauthorize explicitly on every value change,
      // including sign-out (reconnect as the signed-out session now, rather
      // than riding the old user's socket until something else drops it).
      if (tokenChanged) this.reauthorizeForTokenChange();
    }

    // Notify capability bootstrappers (e.g. flag eval context) of the change —
    // on sign-out too. TBP-653: this used to return early for a missing token,
    // so the flag eval context kept the signed-out user's claims (plan, role,
    // tenant) and route rules kept evaluating as that user.
    for (const fn of this._onTokensSubs) {
      try {
        fn(accessToken);
      } catch {
        /* subscriber errors swallowed */
      }
    }

    // TBP-654 — every verdict taken with the old token is suspect. Fired after
    // the subscribers above so the flag eval context already holds the new
    // claims when the current route is re-checked.
    if (tokenChanged) this.authorizationChanged('token');
  }

  /**
   * TBP-660 — one catch-up per reconnect: `GET /billing/state` and
   * `GET /entitlements`, applied to auth-core's billing stores and to
   * `bridge.tenant.subscription` / `bridge.tenant.entitlements`. Reports an
   * authorization change only when something actually moved, so a routine
   * reconnect costs two GETs and nothing else. Signed-out sessions have no
   * workspace state to repair. Never throws.
   */
  private async catchUpAfterReconnect(): Promise<void> {
    const accessToken = this._currentAuthToken;
    if (!accessToken) return;
    const seq = ++this._catchUpSeq;

    let appId: string;
    let base: string;
    try {
      const config = this.configService.getConfig();
      appId = config.appId;
      base = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
    } catch {
      return;
    }
    const auth = { Authorization: `Bearer ${accessToken}` };
    const [billing, entitlementsBody] = await Promise.all([
      this.getJson(`${base}/billing/state`, { ...auth, 'x-app-id': appId }),
      this.getJson(`${base}/entitlements`, auth),
    ]);
    // A newer reconnect or a different session owns the stores now.
    if (seq !== this._catchUpSeq || accessToken !== this._currentAuthToken) return;

    let changed = false;

    const state = billing as { plan?: { slug?: unknown; name?: unknown }; status?: unknown } | null;
    if (state && typeof state.plan?.slug === 'string') {
      const before = tenantSubscriptionSignal();
      try {
        useBridge().subscription.hydrate(state as Parameters<ReturnType<typeof useBridge>['subscription']['hydrate']>[0]);
      } catch {
        /* auth-core store unavailable — the tenant signal below still moves */
      }
      applySubscriptionPlanChanged({ to: state.plan, status: state.status });
      const after = tenantSubscriptionSignal();
      if (before?.plan?.slug !== after?.plan?.slug || before?.status !== after?.status) changed = true;
    }

    const map = (entitlementsBody as { entitlements?: unknown } | null)?.entitlements;
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      const before = JSON.stringify(tenantEntitlementsSignal());
      try {
        useBridge().entitlementsStore.applyEntitlementsChanged(map as Record<string, boolean>);
      } catch {
        /* auth-core store unavailable — the tenant signal below still moves */
      }
      applyEntitlementsChanged({ entitlements: map });
      if (before !== JSON.stringify(tenantEntitlementsSignal())) changed = true;
    }

    if (changed) this.authorizationChanged('reconnect');
  }

  private async getJson(url: string, headers: Record<string, string>): Promise<unknown> {
    try {
      const res = await this._fetch(url, { method: 'GET', headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * TBP-654 — something that can change a route verdict changed without a flag
   * changing. Called exactly once per triggering event and always BEFORE the
   * event reaches `bridgeEvents`, so a handler that navigates is evaluated
   * against fresh state.
   *
   * Angular's route guard evaluates FF 2.0 rules locally, per call, against a
   * live context (plan from the JWT and the billing stores), so there is no
   * verdict cache to fall stale in the guard itself. What does go stale:
   *   - the reactive flag signals (`flagSignal` / `<bridge-feature-flag>`) —
   *     they only recompute when told a flag changed, and a plan or
   *     entitlements push changes a rule's inputs, not the flag;
   *   - auth-core's legacy FeatureFlagService cache (5-min TTL), which apps can
   *     still reach through `AuthService.getBridgeAuth()`;
   *   - the page the user is already on — guards only run on navigation.
   *     Subscribers (`BridgeBootstrapService`) re-check it.
   */
  private authorizationChanged(reason: BridgeAuthorizationChangeReason): void {
    try {
      this.authService.getBridgeAuth().invalidateFeatureFlagCache();
    } catch {
      /* BridgeAuth not initialised yet — nothing cached */
    }
    notifyAllFlagsChanged();
    // A new token IS the refreshed state; every other reason needs one.
    if (reason !== 'token') void this.refreshForAuthorizationChange();
    for (const fn of this._onAuthorizationChangeSubs) {
      try {
        fn(reason);
      } catch {
        /* subscriber errors swallowed */
      }
    }
  }

  /**
   * TBP-654 (upgrade race) — the page shows a new plan as soon as
   * `subscription.plan_changed` patches `bridge.tenant.subscription`, but the
   * access token that carries the new plan only arrives with the next
   * refresh. That refresh used to start on `user.state_changed`, which the
   * server publishes AFTER `plan_changed` (TBP-660), so a user who clicked into
   * a plan-gated route the moment the page said "Pro" was judged on the old
   * token and refused (2 of 6 stage runs on bridge-svelte).
   *
   * So every authorization-affecting event starts the refresh immediately and
   * registers it as the pending authorization change the route guard waits
   * for (bounded) before deciding. One refresh per burst: an event that
   * arrives while one is in flight joins it. No loop: the refreshed token only
   * re-runs `authorizationChanged('token')`, which never refreshes, and the
   * reconnect it causes is flagged self-induced. A signed-out session has no
   * token to refresh and no pending change.
   *
   * The new token is pushed through `onTokensChanged` before the pending
   * change settles. The tokens `effect()` would do it too, but Angular runs
   * effects later, and a guard that resumed in between would still evaluate
   * the old claims. The effect then sees an unchanged value.
   */
  private refreshForAuthorizationChange(): Promise<void> | undefined {
    if (!this._currentAuthToken) return undefined;
    const pending = pendingAuthorizationChange();
    if (pending) return pending;
    let refresh: Promise<unknown>;
    try {
      refresh = Promise.resolve(this.authService.getBridgeAuth().refreshTokens()).then((tokens) => {
        const next = (tokens as { accessToken?: unknown } | null | undefined)?.accessToken;
        if (typeof next === 'string' && next !== this._currentAuthToken && this._started) {
          this.onTokensChanged(next, this._apiBaseUrl);
        }
      });
    } catch (err) {
      // BridgeAuth not initialised — nothing to refresh with.
      refresh = Promise.reject(err);
    }
    return trackAuthorizationChange(refresh);
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

  /**
   * Subscribe to realtime status changes (TBP-644): state, the machine-readable
   * reason, whose side a fault is on (`app` / `config` / `bridge` / `network`),
   * whether the client is still retrying, a docs link and a support ref. Fires
   * on every change, not with the current value — read the
   * `realtimeStatusDetail` signal (or `BridgeService.realtimeStatusDetail`)
   * for that. Returns an unsubscribe fn.
   */
  onStatus(handler: (status: RealtimeStatus) => void): () => void {
    this._onStatusSubs.add(handler);
    return () => this._onStatusSubs.delete(handler);
  }

  /**
   * Subscribe to changes that can alter a route guard's verdict without a flag
   * changing (TBP-654): plan change, entitlements change, user state change,
   * new access token. Caches are already invalidated when subscribers run.
   * Returns an unsubscribe fn.
   */
  onAuthorizationChange(handler: (reason: BridgeAuthorizationChangeReason) => void): () => void {
    this._onAuthorizationChangeSubs.add(handler);
    return () => this._onAuthorizationChangeSubs.delete(handler);
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
    clearPendingAuthorizationChange();
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
