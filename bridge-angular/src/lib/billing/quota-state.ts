/**
 * TBP-744 — level 2: one quota's live numbers, and the plan's entitlements, as
 * Angular signals for your own UI. Angular port of bridge-svelte's
 * `useQuota(metric)` and `$entitlements` (TBP-697).
 *
 *   readonly tickets = injectQuota('tickets');
 *
 *   @if (tickets().loading) { … }
 *   @else if (tickets().unlimited) { Unlimited tickets }
 *   @else { {{ tickets().used }} of {{ tickets().limit }} tickets }
 *
 * Reads auth-core's live quota cache (one `GET /usage/quota/:metric` on first
 * read, then every `quota.updated` push), so the numbers move on their own.
 *
 * The rule it exists to keep: **no number until there is a real one.** While
 * the first answer is in flight `loading` is true and `used`, `limit` and
 * `remaining` are `null` — never `0`.
 */
import { DestroyRef, computed, inject, isDevMode, signal, type Signal } from '@angular/core';
import { useBridge as useBillingBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { tenantEntitlementsSignal } from '../core/snapshot-stores';
import { AuthService } from '../shared/services/auth.service';

type QuotaStore = ReturnType<typeof useBillingBridge>['quotas'];

export interface QuotaState {
  /** True until Bridge has answered for this metric. Numbers are `null` meanwhile. */
  readonly loading: boolean;
  /** True once Bridge has answered that the plan puts no quota on this metric. */
  readonly unlimited: boolean;
  /** Counter: this period's total. Gauge: how many exist now. `null` while loading or unlimited. */
  readonly used: number | null;
  /** The plan's cap. `null` while loading or unlimited. */
  readonly limit: number | null;
  /** What is left before the cap. `null` while loading or unlimited. */
  readonly remaining: number | null;
  /** `'approaching'` from 80%, `'critical'` from 95%. `null` below that. */
  readonly warningLevel: 'approaching' | 'critical' | null;
  /** `'counter'` resets each period; `'gauge'` is a count the app reports. */
  readonly kind: 'counter' | 'gauge' | null;
  /** The full snapshot (policy, overage fields, …), or `null`. */
  readonly snapshot: QuotaSnapshot | null;
}

const LOADING: QuotaState = Object.freeze({
  loading: true,
  unlimited: false,
  used: null,
  limit: null,
  remaining: null,
  warningLevel: null,
  kind: null,
  snapshot: null,
});

const UNLIMITED: QuotaState = Object.freeze({ ...LOADING, loading: false, unlimited: true });

// The QuotaStore answers "no quota on this plan" by deleting the metric and
// notifying `undefined`, keeping no record, and `ensureHydrated()` refetches any
// metric it has no snapshot for. A reader that re-read on that notification
// would loop one GET at a time — so the "unlimited" answers are remembered here,
// per store, until the workspace changes.
interface Tracking {
  unlimited: Set<string>;
  workspace: string | null | undefined;
}
const _tracking = new WeakMap<QuotaStore, Tracking>();

function tracking(store: QuotaStore): Tracking {
  let t = _tracking.get(store);
  if (!t) {
    const tr: Tracking = { unlimited: new Set(), workspace: undefined };
    _tracking.set(store, tr);
    store.subscribe((metric, snap) => {
      if (snap) tr.unlimited.delete(metric);
      else tr.unlimited.add(metric);
    });
    t = tr;
  }
  return t;
}

function workspaceOf(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const tid = (JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { tid?: unknown }).tid;
    return typeof tid === 'string' ? tid : null;
  } catch {
    return null;
  }
}

/** A different workspace (or signing in/out) is a different plan: forget "unlimited". */
export function noteQuotaWorkspace(store: QuotaStore, accessToken: string | null | undefined): void {
  const t = tracking(store);
  const ws = workspaceOf(accessToken);
  if (t.workspace !== undefined && ws !== t.workspace) t.unlimited.clear();
  t.workspace = ws;
}

/**
 * One quota's state right now, from a quota store. Asks Bridge on the first
 * read (the store dedupes in-flight requests). Framework-free, for tests and
 * non-component code.
 */
export function readQuotaState(metric: string, store?: QuotaStore): QuotaState {
  let s: QuotaStore;
  try {
    s = store ?? useBillingBridge().quotas;
  } catch {
    return LOADING;
  }
  const t = tracking(s);
  let snap = s.get(metric);
  if (!snap && !t.unlimited.has(metric)) snap = s.ensureHydrated(metric);
  if (snap) {
    return {
      loading: false,
      unlimited: false,
      used: snap.used,
      limit: snap.limit,
      remaining: snap.remaining,
      warningLevel: snap.warningLevel ?? null,
      // Servers that predate gauges send no kind: those quotas are counters.
      kind: snap.kind === 'gauge' ? 'gauge' : 'counter',
      snapshot: snap,
    };
  }
  return t.unlimited.has(metric) ? UNLIMITED : LOADING;
}

/**
 * Whether a quota blocks its action: only a known hard cap with nothing left.
 * Loading, unlimited and metered (bills overage instead) never block.
 */
export function quotaGateState(q: QuotaState): 'loading' | 'unlimited' | 'metered' | 'available' | 'at-limit' {
  if (q.loading) return 'loading';
  if (q.unlimited) return 'unlimited';
  if (q.snapshot?.policy === 'metered') return 'metered';
  const atCap =
    (q.remaining !== null && q.remaining <= 0) || (q.used !== null && q.limit !== null && q.used >= q.limit);
  return atCap ? 'at-limit' : 'available';
}

/**
 * Live numbers for one quota metric, as a signal. Call in an injection context
 * (a component field initialiser or constructor); the subscription ends with it.
 *
 * @param metric The metric key, or a signal of it when the key itself changes.
 */
export function injectQuota(metric: string | Signal<string>): Signal<QuotaState> {
  const key = typeof metric === 'string' ? () => metric : metric;
  const auth = inject(AuthService);
  const version = signal(0);
  const bump = () => version.update((v) => v + 1);

  let store: QuotaStore | null = null;
  try {
    store = useBillingBridge().quotas;
  } catch {
    store = null;
  }
  const offQuota = store?.subscribe((m) => {
    if (m === key()) bump();
  });
  inject(DestroyRef).onDestroy(() => offQuota?.());

  return computed(() => {
    version();
    // A token arriving is what lets a pre-sign-in read finally hydrate, and a
    // workspace switch is a different plan.
    const token = auth.tokens()?.accessToken;
    let s = store;
    if (!s) {
      try {
        s = useBillingBridge().quotas;
      } catch {
        return LOADING;
      }
    }
    noteQuotaWorkspace(s, token);
    return readQuotaState(key(), s);
  });
}

// ── Entitlements ─────────────────────────────────────────────────────────────

export interface EntitlementsState {
  /** True once Bridge has answered for this session. Before that, every `can()` is `false`. */
  readonly ready: boolean;
  /** Fail-closed: `true` only when the plan grants `key`. */
  can(key: string): boolean;
  /** Every entitlement Bridge sent, as `{ key: boolean }`. Empty until `ready`. */
  readonly all: Readonly<Record<string, boolean>>;
}

let _noted = false;

/**
 * TBP-705 — a direct plan-feature check is the documented exception; the
 * standard gate is a flag ruled `bridge:billing.entitlement.<key> eq true`.
 * Says so once per page load, in development only.
 */
export function noteDirectPlanCheck(form: 'entitled' | 'can', key: string, dev: boolean): void {
  if (_noted || !dev) return;
  _noted = true;
  const written = form === 'entitled' ? `*bridgeEntitled="'${key}'"` : `entitlements().can('${key}')`;
  console.info(
    `[bridge] ${written} checks the plan directly. The standard is a flag ruled on ` +
      `bridge:billing.entitlement.${key} — see "npx @nebulr-group/bridge-cli check gates". ` +
      `(Development only — this note is not shown in production.)`,
  );
}

/** Test hook. */
export function __resetDirectPlanCheckNote(): void {
  _noted = false;
}

/** Build an entitlements state from a map (null = Bridge has not answered). */
export function entitlementsStateOf(
  map: Record<string, boolean> | null,
  onCan?: (key: string) => void,
): EntitlementsState {
  const all = Object.freeze({ ...(map ?? {}) });
  return Object.freeze({
    ready: map !== null,
    all,
    can: (key: string) => {
      onCan?.(key);
      return all[key] === true;
    },
  });
}

/**
 * The workspace's plan entitlements, as a signal. Fail-closed: `can()` is false
 * until Bridge has answered (`ready`) and for any key the plan does not grant.
 * Moves on its own with every `entitlements.changed` push; empty when signed out.
 *
 * The exception, not the standard: gate a plan feature with a flag
 * (`<bridge-feature-flag key>`) whose rule is `bridge:billing.entitlement.<key> eq true`.
 */
export function injectEntitlements(): Signal<EntitlementsState> {
  const auth = inject(AuthService);
  const version = signal(0);
  let store: ReturnType<typeof useBillingBridge>['entitlementsStore'] | null = null;
  try {
    store = useBillingBridge().entitlementsStore;
  } catch {
    store = null;
  }
  const off = store?.subscribe(() => version.update((v) => v + 1));
  inject(DestroyRef).onDestroy(() => off?.());
  const dev = isDevMode();

  return computed(() => {
    version();
    if (!auth.tokens()?.accessToken) return entitlementsStateOf(null);
    const snapshot = tenantEntitlementsSignal();
    let core: Record<string, boolean> | null = null;
    if (store && typeof store.isHydrated === 'function' && store.isHydrated()) core = store.all();
    return entitlementsStateOf(snapshot ?? core, (key) => noteDirectPlanCheck('can', key, dev));
  });
}
