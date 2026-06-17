/**
 * `LazySlice<T>` — the reactive primitive for snapshot-omitted slices.
 * Angular port of bridge-svelte's `core/lazy-slice.ts`.
 *
 * Each lazy slice (plans, quotas, members, settings, …) is a `LazySlice<T>`.
 * The class composes:
 *
 *   1. An Angular `signal<T | null>` — `null` until `.load()` resolves once.
 *   2. A `.load()` method returning `Promise<T>` — idempotent and dedup-safe;
 *      concurrent callers share the in-flight fetch.
 *   3. A thenable bridge — `await bridge.app.plans` triggers `.load()` and
 *      resolves to `T`.
 *   4. An `apply(value)` setter for reactive binding — channel events keep
 *      loaded slices fresh without re-fetching.
 *   5. `.loading` and `.error` reactive (signal) companions for UI binding.
 *
 * The svelte version exposes a `subscribe` store contract; in Angular the
 * reactive read is the `value` signal (and the `_peek()` synchronous read).
 *
 * The thenable trick: `await someObj` triggers `someObj.then(resolve, reject)`.
 */
import { signal, type Signal, type WritableSignal } from '@angular/core';

export type LoadFn<T> = () => Promise<T>;

export interface LazySliceOptions<T> {
  /** Called on first `.load()` (or first `await`). Idempotent. */
  load: LoadFn<T>;
  /** Optional initial value (e.g. seeded by tests). */
  initial?: T | null;
}

export class LazySlice<T> {
  private readonly _value: WritableSignal<T | null>;
  private readonly _loading: WritableSignal<boolean> = signal(false);
  private readonly _error: WritableSignal<Error | null> = signal(null);

  private readonly _loadFn: LoadFn<T>;
  private _loaded = false;
  private _inflight: Promise<T> | null = null;

  /** Reactive value signal — `null` until first successful load. */
  readonly value: Signal<T | null>;
  readonly loading: Signal<boolean> = this._loading.asReadonly();
  readonly error: Signal<Error | null> = this._error.asReadonly();

  constructor(opts: LazySliceOptions<T>) {
    this._loadFn = opts.load;
    this._value = signal(opts.initial ?? null);
    this.value = this._value.asReadonly();
    if (opts.initial !== undefined && opts.initial !== null) this._loaded = true;
  }

  /**
   * Load the slice value. Idempotent — calling more than once returns the
   * cached value unless `force: true` is passed. Concurrent callers share the
   * in-flight promise. On error the rejection propagates AND populates
   * `.error`; subsequent `.load()` calls retry.
   */
  async load(opts?: { force?: boolean }): Promise<T> {
    if (!opts?.force && this._loaded) {
      return this._value() as T;
    }
    if (this._inflight) return this._inflight;

    this._loading.set(true);
    this._error.set(null);
    this._inflight = this._loadFn()
      .then((v) => {
        this._value.set(v);
        this._loaded = true;
        return v;
      })
      .catch((err) => {
        const e = err instanceof Error ? err : new Error(String(err));
        this._error.set(e);
        throw e;
      })
      .finally(() => {
        this._inflight = null;
        this._loading.set(false);
      });
    return this._inflight;
  }

  /**
   * Reactive binding for already-loaded slices. Channel handlers (e.g.
   * `quota.updated`) call this to push fresh values without re-fetching.
   * No-op if the slice hasn't been loaded yet.
   */
  apply(value: T): void {
    if (!this._loaded) return;
    this._value.set(value);
  }

  /** Force-set value AND mark loaded (push-event hydration before any load). */
  preload(value: T): void {
    this._value.set(value);
    this._loaded = true;
  }

  /** True iff `.load()` has resolved at least once OR `preload()` was called. */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /** Make the slice thenable: `await bridge.app.plans` triggers load. */
  then<TR = T, TE = never>(
    onFulfilled?: ((value: T) => TR | PromiseLike<TR>) | null,
    onRejected?: ((reason: unknown) => TE | PromiseLike<TE>) | null,
  ): Promise<TR | TE> {
    return this.load().then(onFulfilled as any, onRejected as any);
  }

  /** Synchronously read the current value (or null). */
  _peek(): T | null {
    return this._value();
  }

  /** Test-only: reset internal state. */
  _resetForTests(): void {
    this._loaded = false;
    this._inflight = null;
    this._value.set(null);
    this._loading.set(false);
    this._error.set(null);
  }
}
