/**
 * TBP-763 — seat limits on the built-in team page (port of bridge-svelte's
 * `team/seats.ts`).
 *
 * Seats are a plan limit the app names (for example `seats`): a gauge Bridge
 * counts itself from workspace membership — active members plus pending
 * invites — which the quota snapshot marks `source: 'membership'`. Bridge's
 * invite API does not refuse at the limit, so the team page runs the check
 * itself when given the limit's name (`seatsMetric`):
 *   - Invite stops at the plan's limit, with a line saying why;
 *   - one invite of several addresses cannot jump past the limit either;
 *   - after an invite, removal, or enable/disable the seat quota is re-read,
 *     so the check follows the team (a live `quota.updated` may arrive too).
 */
import { useBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { logger } from '../../shared/logger';

/**
 * Seats left on the plan, or null when there is no cap to enforce here:
 * not loaded yet, no limit on the plan, or a metered limit (extra seats are
 * billed, not refused).
 */
export function seatsLeft(snapshot: QuotaSnapshot | undefined | null): number | null {
  if (!snapshot || snapshot.policy === 'metered') return null;
  return typeof snapshot.remaining === 'number' ? snapshot.remaining : null;
}

/**
 * Why an invite of `count` addresses is refused with `remaining` seats left,
 * or null when it fits. `remaining` null = unknown (loading / no limit): the
 * page does not guess — the check is a courtesy, the limit is the plan's.
 */
export function inviteSeatError(count: number, remaining: number | null | undefined): string | null {
  if (remaining === null || remaining === undefined) return null;
  const left = Math.max(0, remaining);
  if (count <= left) return null;
  if (left === 0) return 'All seats on your plan are taken. Upgrade your plan to invite more people.';
  return `Your plan has ${left} ${left === 1 ? 'seat' : 'seats'} left, and this invites ${count}. Invite fewer people or upgrade your plan.`;
}

/** The line shown in place of an enabled Invite button when every seat is taken. */
export function seatsAtLimitMessage(snapshot: QuotaSnapshot | undefined | null): string {
  const limit = snapshot?.limit;
  const all = typeof limit === 'number' ? `All ${limit.toLocaleString()} seats` : 'All seats';
  // Bridge counts pending invites as seats when it counts from membership.
  const invites = snapshot?.source === 'membership' ? ' (pending invites count)' : '';
  return `${all} on your plan are taken${invites}. Upgrade your plan to invite more people.`;
}

/** After the team changed: re-read the seat count, when the page counts seats. */
export function seatsChanged(seatsMetric: string | undefined | null): void {
  if (!seatsMetric) return;
  try {
    useBridge().quotas.reconcileAfterReport(seatsMetric, 0);
  } catch (err) {
    logger.debug('[bridge-team] seat re-read skipped:', err);
  }
}
