/**
 * Billing 2.0 — auth-core billing-store → Angular signal adapters.
 *
 * The Billing 2.0 drop-in components read from auth-core's billing surface
 * (`useBridge().subscription` / `.quotas`), which exposes the Svelte-store
 * contract: `subscribe(listener) => unsubscribe`, listener invoked immediately
 * with the current value and again on every change. svelte consumes that via
 * `$state` + `onMount(subscribe)`; react via `useSyncExternalStore`.
 *
 * Angular's equivalent is a `signal` seeded from the current value and updated
 * from the store's subscribe callback. The factories below return a writable-
 * backed readonly signal plus the unsubscribe fn so callers (components) can
 * tear down in `ngOnDestroy`.
 */
import { signal, type Signal } from '@angular/core';
import {
  useBridge,
  type BillingSubscriptionSnapshot,
  type QuotaSnapshot,
} from '@nebulr-group/bridge-auth-core';

export interface BillingSignal<T> {
  /** Reactive snapshot signal. */
  value: Signal<T>;
  /** Tear down the underlying store subscription. */
  destroy(): void;
}

/**
 * Subscribe to `useBridge().subscription` and surface its snapshot as a signal.
 * The store invokes the listener synchronously on subscribe, so the signal is
 * seeded immediately.
 */
export function createSubscriptionSignal(): BillingSignal<BillingSubscriptionSnapshot> {
  const subscription = useBridge().subscription;
  const s = signal<BillingSubscriptionSnapshot>(subscription.snapshot());
  const unsub = subscription.subscribe((snap) => s.set(snap));
  return { value: s.asReadonly(), destroy: unsub };
}

/**
 * Subscribe to a single metric's quota snapshot. Reading `quota(metric)` kicks
 * off lazy hydration on first call; subsequent `quota.updated` pushes update the
 * signal. Returns `undefined` while hydration is in flight.
 */
export function createQuotaSignal(metric: string): BillingSignal<QuotaSnapshot | undefined> {
  const bridge = useBridge();
  const s = signal<QuotaSnapshot | undefined>(bridge.quota(metric));
  const unsub = bridge.quotas.subscribe((m) => {
    if (m === metric) s.set(bridge.quota(metric));
  });
  return { value: s.asReadonly(), destroy: unsub };
}
