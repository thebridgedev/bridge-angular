/**
 * Feature Flags 2.0 — Angular signal-based reactive flag access.
 * Angular port of bridge-svelte's `flags/flag.svelte.ts`.
 *
 * Thin wrapper around `registry.ts`. Svelte drives reactivity with `$state` /
 * `$derived`; here a per-flag version `signal` plays the role of svelte's
 * `versions` rune, and `computed()` plays the role of `$derived`.
 *
 * The registry's change-bus is wired to a module-level version map signal once
 * (there's a single Angular app runtime, so no leak concerns). Any `computed`
 * that reads `flagVersions()` re-runs whenever a flag changes in the cache.
 */
import { computed, signal, type Signal } from '@angular/core';
import type { EvalContext, FlagEvalResult } from '@nebulr-group/bridge-auth-core';
import { evaluateFlag, subscribeToFlagChanges } from './registry';

// Per-flag version counter. Replacing the Map reference forces computed readers
// to re-run (signals use referential equality on the value by default).
const _versions = signal<Map<string, number>>(new Map());
const _lastSeenValue = new Map<string, unknown>();

function bumpVersion(key: string): void {
  const next = new Map(_versions());
  next.set(key, (next.get(key) ?? 0) + 1);
  _versions.set(next);
}

// Wire the registry's change-bus to the reactive version map. Lives for the
// lifetime of the module.
subscribeToFlagChanges((key, value) => {
  if (key === '*') {
    _versions.set(new Map());
    _lastSeenValue.clear();
    return;
  }
  const prev = _lastSeenValue.get(key);
  if (prev !== undefined && sameValue(prev, value)) return;
  _lastSeenValue.set(key, value);
  bumpVersion(key);
});

/**
 * Internal — the reactive version map signal. Reading it inside a `computed`
 * subscribes that computed to flag changes.
 */
export function flagVersions(): Signal<Map<string, number>> {
  return _versions;
}

/**
 * Reactive flag accessor. Returns a `Signal<FlagEvalResult<T>>` that re-runs
 * whenever the flag changes in the cache.
 *
 *   const banner = flagSignal('show_banner', false);
 *   // template: @if (banner().passed) { <Banner /> }
 *
 * Pass `context` to drive rule eval with dev-supplied attributes — e.g.
 * `flagSignal('enterprise-feature', false, { attributes: { plan } })`.
 *
 * NOTE: must be called from an Angular injection / reactive context (a
 * component constructor, field initializer, or service constructor) because it
 * uses `computed()`.
 */
export function flagSignal<T>(
  key: string,
  defaultValue: T,
  context?: Partial<EvalContext>,
): Signal<FlagEvalResult<T>> {
  return computed(() => {
    // Reactive dependency: read the version map so this re-runs on change.
    _versions().get(key);
    return evaluateFlag<T>(key, defaultValue, context);
  });
}

/** Test-only: reset the reactive version state. */
export function __resetFlagReactivity(): void {
  _versions.set(new Map());
  _lastSeenValue.clear();
}

// ── helpers ─────────────────────────────────────────────────────────────────

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
