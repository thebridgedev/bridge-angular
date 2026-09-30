/**
 * TBP-763 — the built-in team page enforces the plan's seat limit.
 *
 * Seats are a gauge Bridge counts from membership (active members plus
 * pending invites; the quota snapshot says `source: 'membership'`). Bridge's
 * invite API does not refuse at the limit, so a team page that did not check
 * let a workspace invite past its plan. With `seatsMetric` the page checks.
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBridge, type TeamUser } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { TeamUserListComponent } from './team-user-list.component';
import { TeamAddUserDialogComponent } from './team-add-user-dialog.component';
import { inviteSeatError, seatsAtLimitMessage, seatsLeft } from './seats';

const seats = (used: number, limit: number, extra: Record<string, unknown> = {}) => ({
  metric: 'seats',
  used,
  limit,
  remaining: limit - used,
  warningLevel: null,
  policy: 'hard' as const,
  kind: 'gauge' as const,
  source: 'membership' as const,
  ...extra,
});

const USER: TeamUser = { id: 'u1', email: 'a@x.test', enabled: true, role: 'ADMIN' } as TeamUser;

let createUsers: ReturnType<typeof vi.fn>;
let deleteUser: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useBridge().quotas.__resetForTests();
  createUsers = vi.fn(async (emails: string[]) => emails.map((email, i) => ({ id: `n${i}`, email, enabled: true })));
  deleteUser = vi.fn(async () => undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          getBridgeAuth: () => ({
            team: {
              listUsers: async () => ({ users: [USER] }),
              listUserRoles: async () => ['ADMIN', 'MEMBER'],
              createUsers,
              deleteUser,
            },
          }),
        },
      },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderList(seatsMetric?: string) {
  const fixture = TestBed.createComponent(TeamUserListComponent);
  if (seatsMetric) fixture.componentRef.setInput('seatsMetric', seatsMetric);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const addButton = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Member')) as HTMLButtonElement;

describe('seat limit on the team page (TBP-763)', () => {
  it('every seat taken → Invite is disabled with a line saying why (pending invites count)', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(5, 5));
    const fixture = await renderList('seats');
    const el = fixture.nativeElement as HTMLElement;

    expect(addButton(el).disabled).toBe(true);
    expect(el.querySelector('[data-bridge-seats-limit]')?.textContent).toContain(
      'All 5 seats on your plan are taken (pending invites count)',
    );
    fixture.destroy();
  });

  it('seats left → Invite is enabled', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(3, 5));
    const fixture = await renderList('seats');
    expect(addButton(fixture.nativeElement).disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-bridge-seats-limit]')).toBeNull();
    fixture.destroy();
  });

  it('without seatsMetric the page does not count seats at all', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(5, 5));
    const fixture = await renderList();
    expect(addButton(fixture.nativeElement).disabled).toBe(false);
    fixture.destroy();
  });

  it('removing a member re-reads the seat count', async () => {
    useBridge().quotas.applyInitialSnapshot('seats', seats(5, 5));
    const reread = vi.spyOn(useBridge().quotas, 'reconcileAfterReport');
    const fixture = await renderList('seats');
    const list = fixture.componentInstance;
    list.openDelete(USER);
    await list.confirmDelete();

    expect(deleteUser).toHaveBeenCalledWith('u1');
    expect(reread).toHaveBeenCalledWith('seats', 0);
    fixture.destroy();
  });

  it('an invite of more addresses than seats left is refused before Bridge adds anyone', async () => {
    const fixture = TestBed.createComponent(TeamAddUserDialogComponent);
    fixture.componentRef.setInput('seatsLeft', 1);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as { emailsText: string; submit(): Promise<void>; error(): string | null };
    dialog.emailsText = 'b@x.test, c@x.test';
    await dialog.submit();

    expect(createUsers).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('Your plan has 1 seat left, and this invites 2. Invite fewer people or upgrade your plan.');
    fixture.destroy();
  });

  it('an invite that fits goes through', async () => {
    const fixture = TestBed.createComponent(TeamAddUserDialogComponent);
    fixture.componentRef.setInput('seatsLeft', 2);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as { emailsText: string; submit(): Promise<void> };
    dialog.emailsText = 'b@x.test, c@x.test';
    await dialog.submit();
    expect(createUsers).toHaveBeenCalledWith(['b@x.test', 'c@x.test']);
    fixture.destroy();
  });
});

describe('seat helpers', () => {
  it('a metered or unknown seat quota is not a cap', () => {
    expect(seatsLeft(undefined)).toBeNull();
    expect(seatsLeft({ ...seats(9, 5), policy: 'metered' } as never)).toBeNull();
    expect(seatsLeft(seats(2, 5) as never)).toBe(3);
  });

  it('inviteSeatError', () => {
    expect(inviteSeatError(3, null)).toBeNull();
    expect(inviteSeatError(2, 2)).toBeNull();
    expect(inviteSeatError(1, 0)).toBe('All seats on your plan are taken. Upgrade your plan to invite more people.');
  });

  it('the at-limit line mentions pending invites only when Bridge counts from membership', () => {
    expect(seatsAtLimitMessage(seats(5, 5) as never)).toContain('(pending invites count)');
    expect(seatsAtLimitMessage({ ...seats(5, 5), source: undefined } as never)).not.toContain('pending');
  });
});
