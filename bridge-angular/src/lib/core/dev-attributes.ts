/**
 * Singleton dev-attribute provider + lazy plan slice — Angular port of the
 * non-reactive parts of bridge-svelte's `core/bridge.ts`.
 *
 * `createBridgeFlags` registers the `DevAttributeProvider` with the
 * AttributeProviderRegistry at bootstrap, LAST in registration order so dev
 * keys win on collision (auth-core locked decision #20: providers < setContext
 * < per-call, and dev's provider is effectively the per-call equivalent for
 * `set` / `bind` / `bindMany`).
 *
 * These live in their own module (not on the injectable `BridgeService`) so the
 * runtime and the flags bootstrap can reach the same singleton instances
 * without an Angular injector — they're referenced from plain-TS wiring code.
 * `BridgeService` re-exposes them as its `attributes` and `app.plans` surface.
 */
import { DevAttributeProvider, type Plan } from '@nebulr-group/bridge-auth-core';
import { LazySlice } from './lazy-slice';

// Singleton dev-managed attribute provider. Registered LAST by the flags
// bootstrap so its set/bind/bindMany keys win on collision with framework
// providers (auth + billing).
const _devAttributes = new DevAttributeProvider();

/** Internal: the flags bootstrap imports this to register the dev provider. */
export function getDevAttributeProvider(): DevAttributeProvider {
  return _devAttributes;
}

// Lazy plan-catalog slice. Loader is wired by the runtime once BridgeAuth is
// available (see bridge-runtime.service.ts). Until then `.load()` rejects.
const _plansSlice = new LazySlice<Plan[]>({
  load: async () => {
    if (!_plansLoader) {
      throw new Error(
        'bridge.app.plans: plan loader not wired — call provideBridge() first.',
      );
    }
    return _plansLoader();
  },
});

let _plansLoader: (() => Promise<Plan[]>) | undefined;

/** Internal: the runtime wires the plan loader once BridgeAuth is available. */
export function setPlansLoader(fn: () => Promise<Plan[]>): void {
  _plansLoader = fn;
}

/** The lazy plan slice exposed as `bridge.app.plans`. */
export function getPlansSlice(): LazySlice<Plan[]> {
  return _plansSlice;
}

/** Test-only: reset the dev-attribute provider + lazy slices. */
export function __resetDevAttributes(): void {
  _plansSlice._resetForTests();
}
