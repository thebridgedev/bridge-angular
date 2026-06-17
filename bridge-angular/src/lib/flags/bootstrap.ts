/**
 * Feature Flags 2.0 — bootstrap (`createBridgeFlags`).
 * Angular port of bridge-svelte's `flags/bootstrap.ts`.
 *
 * Builds a fully wired `BridgeFlags` bundle on TOP of the core Bridge runtime
 * (`BridgeRuntimeService.start()` must already have run). The shared
 * `RealtimeClient` is read from the runtime and re-used — no second websocket.
 *
 * Svelte divergences:
 *   - `apiBaseUrl` / `apiKey` are resolved from `BridgeConfigService` by the
 *     caller (`BridgeService`) and passed in — Angular has no module-level
 *     config store.
 *   - There is no `getBridgeAuth()` (auth-core `BridgeAuth` singleton) in
 *     bridge-angular's auth model, so the usage reporter + quota.configure
 *     seeding done in svelte's bootstrap are owned by the runtime instead.
 *   - The auth-token → flag-context subscription is driven by the caller via
 *     `applyAuthContext(accessToken)` (the runtime's tokens effect calls it),
 *     rather than a svelte `tokenStore.subscribe`.
 *   - Svelte reactivity (`$state` bumps) becomes the Angular reactivity bridge
 *     (`flag-reactivity.ts`) via `notifyFlagChanged` / `notifyAllFlagsChanged`.
 */
import {
  BridgeFlags,
  type BridgeFlagsMode,
  type BridgeFlagsHooks,
  attachIdentity,
  type BridgeIdentity,
  type IdentityStorage,
  type AnonymousTrackingMode,
  MemoryIdentityStorage,
  TelemetryBatcher,
  type TelemetryBatcherConfig,
  AuthAttributeProvider,
  type AuthJwtClaims,
  BillingAttributeProvider,
  useBridge,
  type RealtimeClient,
} from '@nebulr-group/bridge-auth-core';

import {
  setBridgeFlagsInstance,
  notifyFlagChanged,
  notifyAllFlagsChanged,
} from './registry';
import { getDevAttributeProvider } from '../core/dev-attributes';
import { logger } from '../shared/logger';

/** A storage implementation backed by `localStorage` / `sessionStorage`. */
export class BrowserIdentityStorage implements IdentityStorage {
  readonly mode: AnonymousTrackingMode;
  private readonly storage: Storage;
  private readonly key: string;

  constructor(mode: 'persistent' | 'session', key = 'bridge.anon_id') {
    this.mode = mode;
    this.key = key;
    if (typeof window === 'undefined') {
      throw new Error(
        'BrowserIdentityStorage requires a window — use MemoryIdentityStorage on the server',
      );
    }
    this.storage = mode === 'persistent' ? window.localStorage : window.sessionStorage;
  }

  read(): string | undefined {
    try {
      return this.storage.getItem(this.key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  write(id: string): void {
    try {
      this.storage.setItem(this.key, id);
    } catch {
      // Quota / privacy mode — silently degrade.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}

export interface CreateBridgeFlagsConfig {
  /** Bridge API base URL. Resolved from BridgeConfigService by the caller. */
  apiBaseUrl: string;
  /** JWT-shaped workspace API key (= appId). Resolved by the caller. */
  apiKey: string;
  /** The shared RealtimeClient from the runtime (attach the flag cache to it). */
  realtime?: RealtimeClient;
  /** Re-hydrate the flag cache when the shared realtime client (re)opens. */
  onRealtimeOpen?: (handler: () => void) => () => void;
  /** Frontend (default) or backend. */
  mode?: BridgeFlagsMode;
  /** Anonymous identity options. Persistent (localStorage) by default. */
  identity?: {
    tracking?: AnonymousTrackingMode;
    storage?: IdentityStorage;
    storageKey?: string;
  };
  /** Telemetry opts — set `enabled: false` to skip. */
  telemetry?: Partial<Omit<TelemetryBatcherConfig, 'apiBaseUrl' | 'apiKey'>>;
  /** Register globally (used by `flagSignal` / `<bridge-feature-flag>`). Default true. */
  registerGlobal?: boolean;
  /** Optional extra hooks chained on top of telemetry + reactivity hooks. */
  hooks?: BridgeFlagsHooks;
}

export interface BridgeFlagsBundle {
  bridge: BridgeFlags;
  identity: BridgeIdentity;
  telemetry: TelemetryBatcher;
  authAttributeProvider: AuthAttributeProvider;
  billingAttributeProvider: BillingAttributeProvider;
  /**
   * Push the current decoded JWT claims into flag eval context. The runtime's
   * tokens effect calls this on every login / logout / refresh — the Angular
   * equivalent of svelte's `tokenStore.subscribe` inside the bootstrap.
   */
  applyAuthContext: (accessToken: string | undefined) => void;
  /** Stop telemetry. Idempotent. */
  stop: () => Promise<void>;
}

function pickIdentityStorage(cfg: CreateBridgeFlagsConfig['identity']): IdentityStorage {
  if (cfg?.storage) return cfg.storage;
  const tracking = cfg?.tracking ?? 'persistent';
  if (tracking === 'none') return new MemoryIdentityStorage('none');
  if (typeof globalThis === 'undefined' || !(globalThis as { window?: unknown }).window) {
    return new MemoryIdentityStorage(tracking);
  }
  return new BrowserIdentityStorage(
    tracking === 'session' ? 'session' : 'persistent',
    cfg?.storageKey,
  );
}

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

export function createBridgeFlags(config: CreateBridgeFlagsConfig): BridgeFlagsBundle {
  if (!config.apiBaseUrl) {
    throw new Error('createBridgeFlags: apiBaseUrl is required');
  }
  if (!config.apiKey) {
    throw new Error('createBridgeFlags: apiKey/appId is required');
  }

  const bridge = new BridgeFlags({ mode: config.mode });

  // Patch upsert/remove/hydrate so realtime mutations re-notify the Angular
  // reactivity layer. Narrow instance-level monkey-patch — never touches
  // auth-core itself.
  const originalUpsert = bridge.upsert.bind(bridge);
  bridge.upsert = (flag) => {
    originalUpsert(flag);
    notifyFlagChanged(flag.key, _BUMP_SENTINEL);
  };
  const originalRemove = bridge.remove.bind(bridge);
  bridge.remove = (key) => {
    originalRemove(key);
    notifyFlagChanged(key, _BUMP_SENTINEL);
  };
  const originalHydrate = bridge.hydrate.bind(bridge);
  bridge.hydrate = (flags) => {
    originalHydrate(flags);
    notifyAllFlagsChanged();
  };

  // Attach the flag cache to the SHARED RealtimeClient owned by the runtime.
  if (config.realtime) {
    config.realtime.attach(bridge);
  }

  const identity = attachIdentity(bridge, pickIdentityStorage(config.identity));

  // Current decoded JWT claims, surfaced to the AuthAttributeProvider so
  // user.role / user.email / tenant.id / privileges flow through the registry.
  let _currentClaims: AuthJwtClaims | undefined;

  // Bridge-managed AttributeProviders — auto-registered; consumers never wire
  // these by hand.
  const billingAttributeProvider = new BillingAttributeProvider();
  billingAttributeProvider.bindStores({
    subscription: useBridge().subscription,
    quotas: useBridge().quotas,
    entitlements: useBridge().entitlementsStore,
  });
  const authAttributeProvider = new AuthAttributeProvider({
    getClaims: () => _currentClaims,
  });
  bridge.registerAttributeProvider(authAttributeProvider);
  bridge.registerAttributeProvider(billingAttributeProvider);
  // Register the dev-managed provider LAST so its set/bind/bindMany keys win on
  // collision with framework providers (locked decision #20).
  bridge.registerAttributeProvider(getDevAttributeProvider());

  const telemetry = new TelemetryBatcher({
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    ...config.telemetry,
  });

  // Compose hooks: telemetry (baseline) + reactivity (eval-driven bumps) + user.
  attachWithCompositeHooks(bridge, telemetry, config.hooks ?? {});

  // Hydrate the flag cache so the first `bridge.flag()` returns the right value.
  const hydrateFlagsCache = async (): Promise<void> => {
    try {
      const res = await fetch(
        `${config.apiBaseUrl.replace(/\/+$/, '')}/admin/flags-internal/flags-cache/${encodeURIComponent(
          config.apiKey,
        )}`,
      );
      if (!res.ok) return;
      const flags = (await res.json()) as unknown;
      if (Array.isArray(flags) && flags.length > 0) {
        bridge.hydrate(flags as Parameters<typeof bridge.hydrate>[0]);
      }
    } catch {
      // Hydration is best-effort.
    }
  };

  // Re-hydrate every time the shared realtime client (re)opens.
  const unsubscribeOpen = config.onRealtimeOpen?.(() => {
    void hydrateFlagsCache();
  });

  // Initial hydrate — covers the realtime-disabled case where onOpen never fires.
  void hydrateFlagsCache();

  if (config.registerGlobal !== false) {
    setBridgeFlagsInstance(bridge);
  }

  // Flag-context concerns on token change. The runtime's tokens effect calls
  // this; mirrors svelte's tokenStore.subscribe inside the bootstrap.
  const applyAuthContext = (accessToken: string | undefined): void => {
    if (!accessToken) {
      _currentClaims = undefined;
      bridge.setContext({ identity: undefined, attributes: {} });
      notifyAllFlagsChanged();
      return;
    }
    const claims = decodeJwtPayload(accessToken);
    if (!claims) return;
    _currentClaims = claims as AuthJwtClaims;
    bridge.setContext({
      identity: typeof claims['sub'] === 'string' ? (claims['sub'] as string) : undefined,
      attributes: {},
    });
    notifyAllFlagsChanged();
  };

  const stop = async (): Promise<void> => {
    unsubscribeOpen?.();
    await telemetry.stop();
  };

  logger.debug('[flags] createBridgeFlags bundle ready');

  return {
    bridge,
    identity,
    telemetry,
    authAttributeProvider,
    billingAttributeProvider,
    applyAuthContext,
    stop,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

const _BUMP_SENTINEL = Symbol('bridge.flags.bump');

/**
 * Telemetry's `attach` calls `bridge.setHooks` and overwrites whatever was
 * there. Capture the batcher's hooks via a one-shot setHooks override, then
 * re-install a composite that calls them + our reactivity bump + user hooks.
 */
function attachWithCompositeHooks(
  bridge: BridgeFlags,
  telemetry: TelemetryBatcher,
  userHooks: BridgeFlagsHooks,
): void {
  let captured: BridgeFlagsHooks = {};
  const originalSetHooks = bridge.setHooks.bind(bridge);
  bridge.setHooks = (hooks: BridgeFlagsHooks): void => {
    captured = hooks ?? {};
  };
  try {
    telemetry.attach(bridge);
  } finally {
    bridge.setHooks = originalSetHooks;
  }
  bridge.setHooks({
    onEval: (ev) => {
      try {
        captured.onEval?.(ev);
      } catch {
        /* telemetry hook errors swallowed */
      }
      try {
        userHooks.onEval?.(ev);
      } catch {
        /* user hook errors swallowed */
      }
      notifyFlagChanged(ev.flag, ev.value);
    },
    onDiscover: (ev) => {
      try {
        captured.onDiscover?.(ev);
      } catch {
        /* ignore */
      }
      try {
        userHooks.onDiscover?.(ev);
      } catch {
        /* ignore */
      }
    },
    onAttributeDeclaration: (decl) => {
      try {
        captured.onAttributeDeclaration?.(decl);
      } catch {
        /* ignore */
      }
      try {
        userHooks.onAttributeDeclaration?.(decl);
      } catch {
        /* ignore */
      }
    },
    onAttributeObserved: (obs) => {
      try {
        captured.onAttributeObserved?.(obs);
      } catch {
        /* ignore */
      }
      try {
        userHooks.onAttributeObserved?.(obs);
      } catch {
        /* ignore */
      }
    },
  });
}
