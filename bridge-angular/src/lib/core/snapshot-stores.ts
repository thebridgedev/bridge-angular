/**
 * `session.snapshot` reactive state — Angular port of bridge-svelte's
 * `core/snapshot-stores.ts`.
 *
 * The wire shapes (`BrandingSnapshot`, `SubscriptionSnapshot`, `UserSnapshot`,
 * `SessionSnapshotData`) and the `applySessionSnapshot` reducer are ported
 * verbatim. The reactive layer differs by framework: svelte uses
 * `writable(null)`; here each slice is an Angular `signal<T | null>(null)`,
 * exposed read-only via `.asReadonly()`.
 *
 * These signals mirror the wire shape produced by bridge-api's
 * SessionSnapshotService and are written exactly once per channel-subscribe
 * (initial connect AND every reconnect) by the runtime. Consumers read them
 * via the unified `BridgeService` surface.
 *
 * Initial state is `null` for every slice. The first paint reads `null` until
 * the channel connects and the snapshot lands.
 */
import { signal, type Signal, type WritableSignal } from '@angular/core';

export interface BrandingSnapshot {
  logo: string;
  name: string;
  primaryButtonBgColor?: string;
  textColor?: string;
  bgColor?: string;
  fontFamily?: string;
}

export interface SubscriptionSnapshot {
  plan: { slug: string; name: string };
  status: string;
  endsAt?: string;
  gateEngaged?: boolean;
}

export interface UserSnapshot {
  id: string;
  email?: string;
  role: string;
  tenantId: string;
}

const _appBranding: WritableSignal<BrandingSnapshot | null> = signal(null);
const _tenantId: WritableSignal<string | null> = signal(null);
const _tenantName: WritableSignal<string | null> = signal(null);
const _tenantSubscription: WritableSignal<SubscriptionSnapshot | null> = signal(null);
const _tenantEntitlements: WritableSignal<Record<string, boolean> | null> = signal(null);
const _user: WritableSignal<UserSnapshot | null> = signal(null);

// Exposed read-only so consumers can't mutate. The internal writables are only
// reached via `applySessionSnapshot` below (called from the runtime).
export const appBrandingSignal: Signal<BrandingSnapshot | null> = _appBranding.asReadonly();
export const tenantIdSignal: Signal<string | null> = _tenantId.asReadonly();
export const tenantNameSignal: Signal<string | null> = _tenantName.asReadonly();
export const tenantSubscriptionSignal: Signal<SubscriptionSnapshot | null> =
  _tenantSubscription.asReadonly();
export const tenantEntitlementsSignal: Signal<Record<string, boolean> | null> =
  _tenantEntitlements.asReadonly();
export const userSnapshotSignal: Signal<UserSnapshot | null> = _user.asReadonly();

export interface SessionSnapshotData {
  app: { branding: BrandingSnapshot };
  tenant: {
    id: string;
    name: string;
    subscription: SubscriptionSnapshot;
    entitlements: Record<string, boolean>;
  };
  user: UserSnapshot;
}

/**
 * Apply a server-emitted snapshot to the reactive signals. Called from the
 * RealtimeClient `setOnSnapshot` callback wired up in the runtime.
 *
 * Side-effect only — never throws. A partial server that omits an inner field
 * leaves the corresponding signal unchanged rather than clobbering it.
 */
export function applySessionSnapshot(data: SessionSnapshotData): void {
  if (data?.app?.branding) _appBranding.set(data.app.branding);
  if (data?.tenant) {
    if (typeof data.tenant.id === 'string') _tenantId.set(data.tenant.id);
    if (typeof data.tenant.name === 'string') _tenantName.set(data.tenant.name);
    if (data.tenant.subscription) _tenantSubscription.set(data.tenant.subscription);
    if (data.tenant.entitlements) _tenantEntitlements.set(data.tenant.entitlements);
  }
  if (data?.user) _user.set(data.user);
}

/** Synchronous read of the current entitlements map (drives `can()`). */
export function readEntitlements(): Record<string, boolean> | null {
  return _tenantEntitlements();
}

/** Test-only: reset every snapshot signal to `null`. */
export function __resetSnapshotStores(): void {
  _appBranding.set(null);
  _tenantId.set(null);
  _tenantName.set(null);
  _tenantSubscription.set(null);
  _tenantEntitlements.set(null);
  _user.set(null);
}
