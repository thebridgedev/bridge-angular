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
 */
import { signal, type Signal, type WritableSignal } from '@angular/core';
import type { ConnectionState } from '@nebulr-group/bridge-auth-core';

const _status: WritableSignal<ConnectionState> = signal<ConnectionState>('idle');

/** Reactive readable signal of the current realtime connection state. */
export const realtimeStatus: Signal<ConnectionState> = _status.asReadonly();

/** Internal — set the current status. Only called by the runtime. */
export function _setRealtimeStatus(state: ConnectionState): void {
  _status.set(state);
}
