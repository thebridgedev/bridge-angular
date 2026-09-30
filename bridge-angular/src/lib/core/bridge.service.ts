/**
 * `BridgeService` — the unified Bridge read surface for Angular.
 * Angular port of bridge-svelte's `core/bridge.ts` (`bridge` singleton).
 *
 * Svelte exposes a module-level `bridge` object grouped by scope
 * (`bridge.app` / `bridge.tenant` / `bridge.user` / `bridge.attributes` /
 * `bridge.events`), each slice a `Readable` store fed by `session.snapshot`.
 * Here it's an injectable service exposing Angular signals for the same
 * conceptual surface, plus the FF 2.0 flag accessors and the dev-attribute /
 * events singletons.
 *
 * `BridgeService` also owns FF 2.0 init: `initFlags()` (called by the bootstrap
 * service after the runtime starts) wires `createBridgeFlags` against the
 * shared RealtimeClient and registers the dev attribute provider LAST.
 */
import { Injectable, inject, type Signal } from '@angular/core';
import type { BridgeAuth } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../shared/services/auth.service';
import { noteBrowserCount } from '../billing/double-count-warning';
import type {
  EvalContext,
  FlagEvalResult,
  DevAttributeProvider,
  Plan,
} from '@nebulr-group/bridge-auth-core';

import { BridgeConfigService } from '../config/bridge-config.service';
import { BridgeRuntimeService } from './bridge-runtime.service';
import {
  appBrandingSignal,
  tenantIdSignal,
  tenantNameSignal,
  tenantSubscriptionSignal,
  tenantEntitlementsSignal,
  userSnapshotSignal,
  readEntitlements,
  type BrandingSnapshot,
  type SubscriptionSnapshot,
  type UserSnapshot,
} from './snapshot-stores';
import { bridgeEvents, type BridgeEventsDispatcher } from './events';
import { getDevAttributeProvider, getPlansSlice } from './dev-attributes';
import { realtimeStatus, realtimeStatusDetail } from './realtime-status';
import type { LazySlice } from './lazy-slice';
import {
  createBridgeFlags,
  type BridgeFlagsBundle,
  type CreateBridgeFlagsConfig,
} from '../flags/bootstrap';
import { evaluateFlag } from '../flags/registry';
import { flagSignal, flagVersions } from '../flags/flag-reactivity';
import type { ConnectionState, RealtimeStatus } from '@nebulr-group/bridge-auth-core';

const DEFAULT_API_BASE_URL = 'https://api.thebridge.dev';

/** Scoped app slice — branding + lazy plan catalog. */
export interface BridgeAppSurface {
  /** Whitelabel branding (logo, colors, name). Populated by session.snapshot. */
  readonly branding: Signal<BrandingSnapshot | null>;
  /** Full plan catalog. Lazy — `await bridge.app.plans` or `.load()`. */
  readonly plans: LazySlice<Plan[]>;
}

/** Scoped tenant slice — id / name / subscription / entitlements. */
export interface BridgeTenantSurface {
  readonly id: Signal<string | null>;
  readonly name: Signal<string | null>;
  /**
   * Canonical subscription (plan + status + endsAt). Populated by session.snapshot
   * and moved by every `subscription.plan_changed` push.
   */
  readonly subscription: Signal<SubscriptionSnapshot | null>;
  readonly entitlements: {
    readonly snapshot: Signal<Record<string, boolean> | null>;
    can(key: string): boolean;
  };
}

/**
 * TBP-744 — usage reporting from the browser (parity with svelte's
 * `bridge.usage`, TBP-697). Count once, where the action happens: when the
 * action stays in the browser, count it here; when the click calls your
 * server, the backend handler counts it and the page reports nothing.
 * *If deleting it frees room, it's a gauge (`set`); if it happened, it's a
 * counter (`report`).*
 */
export interface BridgeUsageSurface {
  /** Count something that happened (a counter). Fire-and-forget, queued and batched. */
  report(metric: string, value?: number, idempotencyKey?: string): void;
  /** Say how many of something exist right now (a gauge). Resolves once stored. */
  set(metric: string, value: number): Promise<void>;
  /** Queue depth, retries and the last flush — for a debug panel. */
  getQueueStatus(): Promise<Awaited<ReturnType<BridgeAuth['usage']['getQueueStatus']>>>;
}

@Injectable({ providedIn: 'root' })
export class BridgeService {
  private readonly authService = inject(AuthService);

  /** Browser usage reporting — `bridge.usage.report(metric)` / `.set(metric, n)`. */
  readonly usage: BridgeUsageSurface = {
    report: (metric, value, idempotencyKey) => {
      noteBrowserCount(metric); // dev-only: warn when the backend counts it too
      this.authService.getBridgeAuth().usage.report(metric, value, idempotencyKey);
    },
    set: (metric, value) => {
      noteBrowserCount(metric);
      return this.authService.getBridgeAuth().usage.set(metric, value);
    },
    getQueueStatus: () => this.authService.getBridgeAuth().usage.getQueueStatus(),
  };

  private _flagsBundle: BridgeFlagsBundle | undefined;

  /** App scope — `bridge.app.branding`, `bridge.app.plans`. */
  readonly app: BridgeAppSurface = {
    branding: appBrandingSignal,
    plans: getPlansSlice(),
  };

  /** Tenant scope — `bridge.tenant.id` / `.name` / `.subscription` / `.entitlements`. */
  readonly tenant: BridgeTenantSurface = {
    id: tenantIdSignal,
    name: tenantNameSignal,
    subscription: tenantSubscriptionSignal,
    entitlements: {
      snapshot: tenantEntitlementsSignal,
      can: (key: string) => !!readEntitlements()?.[key],
    },
  };

  /** Authenticated user (id/email/role/tenantId). Populated by session.snapshot. */
  readonly user: Signal<UserSnapshot | null> = userSnapshotSignal;

  /** Single attribute write surface — `set` / `bind` / `bindMany` into flag eval context. */
  readonly attributes: DevAttributeProvider = getDevAttributeProvider();

  /** Single events dispatcher — `bridge.events.handle({...})`. */
  readonly events: BridgeEventsDispatcher = bridgeEvents;

  /** Reactive realtime connection status. */
  readonly realtimeStatus: Signal<ConnectionState> = realtimeStatus;

  /**
   * Full realtime status (TBP-644) — the reason live updates are off, whose
   * side it is, whether it is still retrying, a docs link and a support ref.
   * `realtimeStatus` above stays the plain state, so existing bindings keep
   * working. For event-style subscription use `BridgeRuntimeService.onStatus`.
   */
  readonly realtimeStatusDetail: Signal<RealtimeStatus> = realtimeStatusDetail;

  constructor(
    private configService: BridgeConfigService,
    private runtime: BridgeRuntimeService,
  ) {}

  /**
   * Initialize Feature Flags 2.0. Called by the bootstrap service AFTER the
   * runtime has started. Idempotent — repeated calls are a no-op. Returns the
   * bundle so advanced consumers can reach the raw BridgeFlags instance.
   */
  initFlags(overrides?: Partial<CreateBridgeFlagsConfig>): BridgeFlagsBundle {
    if (this._flagsBundle) return this._flagsBundle;

    const config = this.configService.getConfig();
    const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;

    this._flagsBundle = createBridgeFlags({
      apiBaseUrl,
      apiKey: config.appId,
      realtime: this.runtime.getRealtime(),
      onRealtimeOpen: (h) => this.runtime.onOpen(h),
      ...overrides,
    });

    // Seed the initial flag context from the current token (if logged in).
    this._flagsBundle.applyAuthContext(this.runtime.getCurrentAuthToken());

    return this._flagsBundle;
  }

  /** The flags bundle, or undefined if `initFlags()` hasn't run yet. */
  getFlagsBundle(): BridgeFlagsBundle | undefined {
    return this._flagsBundle;
  }

  /**
   * Push the current decoded JWT claims into flag eval context. The runtime's
   * tokens effect calls this on login / logout / refresh.
   */
  applyAuthContext(accessToken: string | undefined): void {
    this._flagsBundle?.applyAuthContext(accessToken);
  }

  // ── FF 2.0 reactive flag access ───────────────────────────────────────────

  /**
   * Reactive flag accessor — returns a `Signal<FlagEvalResult<T>>` that re-runs
   * whenever the flag changes in the cache. Angular equivalent of svelte's
   * `useFlag`. Call from a component/service injection context.
   *
   *   const banner = bridge.flag('show_banner', false);
   *   // template: @if (banner().passed) { ... }
   */
  flag<T>(
    key: string,
    defaultValue: T,
    context?: Partial<EvalContext>,
  ): Signal<FlagEvalResult<T>> {
    return flagSignal<T>(key, defaultValue, context);
  }

  /**
   * One-shot (non-reactive) flag read. Pass `context` for per-call attributes
   * (dev wins on collision). Equivalent of svelte's `evaluateFlag`.
   */
  evaluate<T>(
    key: string,
    defaultValue: T,
    context?: Partial<EvalContext>,
  ): FlagEvalResult<T> {
    return evaluateFlag<T>(key, defaultValue, context);
  }

  /**
   * Internal reactive dependency — reading this signal inside a `computed`
   * subscribes it to all flag-cache changes. Used by `<bridge-feature-flag>` to
   * keep its evaluation reactive without nesting `computed`s.
   */
  _flagVersions() {
    return flagVersions()();
  }
}
