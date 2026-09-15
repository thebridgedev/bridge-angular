/**
 * Reactive realtime connection state — Angular port of bridge-svelte's
 * `core/realtime-status.ts`.
 *
 * The Bridge realtime channel is a fundamental Bridge construct shared by flags
 * AND billing (and any future capability needing live updates). The runtime
 * mounts the connection; this signal reflects its current state. Consumers read
 * it to surface offline indicators, retry banners, etc.
 *
 * Svelte uses `writable<ConnectionState>('idle')`; here it's an Angular signal.
 *
 * TBP-644 — the full `RealtimeStatus` (reason, whose side, retrying, docs link,
 * ref) is a SIBLING signal, `realtimeStatusDetail`, rather than a change to
 * `realtimeStatus`: that signal is a plain `ConnectionState` string apps compare
 * and bind directly, so widening its type would break them. The state always
 * agrees across both.
 */
import { signal, type Signal, type WritableSignal } from '@angular/core';
import type { ConnectionState, RealtimeStatus } from '@nebulr-group/bridge-auth-core';

const _status: WritableSignal<ConnectionState> = signal<ConnectionState>('idle');
const _detail: WritableSignal<RealtimeStatus> = signal<RealtimeStatus>({
  state: 'idle',
  retrying: false,
  since: Date.now(),
});

/** Reactive readable signal of the current realtime connection state. */
export const realtimeStatus: Signal<ConnectionState> = _status.asReadonly();

/**
 * Reactive readable signal of the full realtime status (TBP-644): `state`, and
 * when live updates are not working, the `reason`, whose `side` the fault is on
 * (`app` / `config` / `bridge` / `network`), whether it is still `retrying`, a
 * `docsUrl` and a support `ref`.
 */
export const realtimeStatusDetail: Signal<RealtimeStatus> = _detail.asReadonly();

/** Internal — set the current state. Only called by the runtime. */
export function _setRealtimeStatus(state: ConnectionState): void {
  _status.set(state);
  // Keep the detail in step on an auth-core without the status hook; with the
  // hook, the detail for this state has already landed — leave it alone.
  if (_detail().state !== state) _detail.set({ state, retrying: false, since: Date.now() });
}

/** Internal — set the full status. Only called by the runtime. */
export function _setRealtimeStatusDetail(status: RealtimeStatus): void {
  _detail.set(status);
  _status.set(status.state);
}
