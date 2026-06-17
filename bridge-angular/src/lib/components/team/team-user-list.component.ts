/**
 * TeamUserList — Angular port of bridge-svelte's `team/TeamUserList.svelte`
 * (and react's `TeamUserList.tsx`).
 *
 * The Users tab: lists team members in a table, with add / edit / reset-password
 * / delete flows driven by the add/edit/confirm dialog subcomponents. Loads via
 * auth-core `getBridgeAuth().team.listUsers()` + `listUserRoles()` on init.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; `onMount(loadData)` →
 * `ngOnInit`.
 */
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import type { TeamUser } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthAlertComponent } from '../sdk-auth/shared/alert.component';
import { AuthSpinnerComponent } from '../sdk-auth/shared/spinner.component';
import { TeamAddUserDialogComponent } from './team-add-user-dialog.component';
import { TeamConfirmDialogComponent } from './team-confirm-dialog.component';
import { TeamEditUserDialogComponent } from './team-edit-user-dialog.component';
import { TeamUserActionsMenuComponent } from './team-user-actions-menu.component';

@Component({
  selector: 'bridge-team-user-list',
  standalone: true,
  imports: [
    AuthAlertComponent,
    AuthSpinnerComponent,
    TeamAddUserDialogComponent,
    TeamConfirmDialogComponent,
    TeamEditUserDialogComponent,
    TeamUserActionsMenuComponent,
  ],
  template: `
    <div [class]="className" [style]="style" data-bridge-team-users>
      <div class="bridge-team-users-header">
        <h3 class="bridge-team-users-title">Team Members</h3>
        <button type="button" class="bridge-btn bridge-btn-primary" (click)="showAddDialog.set(true)">
          Add Member
        </button>
      </div>

      @if (loading()) {
        <div class="bridge-team-loading">
          <bridge-auth-spinner [size]="32" />
          <span>Loading team members...</span>
        </div>
      } @else if (loadError()) {
        <bridge-auth-alert variant="error">{{ loadError() }}</bridge-auth-alert>
      } @else if (users().length === 0) {
        <div class="bridge-team-empty">
          <p>No team members yet.</p>
          <button type="button" class="bridge-btn bridge-btn-primary" (click)="showAddDialog.set(true)">
            Add your first team member
          </button>
        </div>
      } @else {
        <div class="bridge-team-table-wrapper">
          <table class="bridge-team-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>
                    <div class="bridge-team-user-cell">
                      <div class="bridge-team-user-name">
                        {{ user.fullName || user.username || user.email }}
                      </div>
                      <div class="bridge-team-user-email">{{ user.email }}</div>
                    </div>
                  </td>
                  <td>
                    <span class="bridge-team-badge">{{ user.role ?? '—' }}</span>
                  </td>
                  <td>
                    <span class="bridge-team-status" [attr.data-state]="user.enabled ? 'active' : 'disabled'">
                      {{ user.enabled ? 'Active' : 'Disabled' }}
                    </span>
                  </td>
                  <td class="bridge-team-actions-cell">
                    <bridge-team-user-actions-menu
                      (edit)="openEdit(user)"
                      (resetPassword)="openReset(user)"
                      (delete)="openDelete(user)"
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <bridge-team-add-user-dialog
      [open]="showAddDialog()"
      (close)="showAddDialog.set(false)"
      (added)="onUsersAdded($event)"
    />

    <bridge-team-edit-user-dialog
      [open]="showEditDialog()"
      [user]="editingUser()"
      [roles]="roles()"
      (close)="closeEdit()"
      (updated)="onUserUpdated($event)"
    />

    <bridge-team-confirm-dialog
      [open]="showDeleteConfirm()"
      title="Delete User"
      [message]="deleteMessage()"
      confirmLabel="Delete"
      variant="danger"
      [loading]="actionLoading()"
      (confirm)="confirmDelete()"
      (cancel)="closeDelete()"
    />

    <bridge-team-confirm-dialog
      [open]="showResetConfirm()"
      title="Reset Password"
      [message]="resetMessage()"
      confirmLabel="Send Reset Link"
      variant="default"
      [loading]="actionLoading()"
      (confirm)="confirmReset()"
      (cancel)="closeReset()"
    />
  `,
})
export class TeamUserListComponent implements OnInit {
  @Input() className = '';
  @Input() style = '';
  @Output() error = new EventEmitter<Error>();

  protected readonly users = signal<TeamUser[]>([]);
  protected readonly roles = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly showAddDialog = signal(false);
  protected readonly showEditDialog = signal(false);
  protected readonly editingUser = signal<TeamUser | null>(null);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly showResetConfirm = signal(false);
  protected readonly deletingUser = signal<TeamUser | null>(null);
  protected readonly resettingUser = signal<TeamUser | null>(null);
  protected readonly actionLoading = signal(false);

  private readonly authService = inject(AuthService);

  protected deleteMessage(): string {
    return `Are you sure you want to delete ${
      this.deletingUser()?.email ?? 'this user'
    }? This action cannot be undone.`;
  }

  protected resetMessage(): string {
    return `Send a password reset link to ${this.resettingUser()?.email ?? 'this user'}?`;
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      const [userResult, rolesResult] = await Promise.all([
        bridge.team.listUsers(),
        bridge.team.listUserRoles(),
      ]);
      this.users.set(userResult.users);
      this.roles.set(rolesResult);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load users');
      this.loadError.set(e.message);
      this.error.emit(e);
    } finally {
      this.loading.set(false);
    }
  }

  openEdit(user: TeamUser): void {
    this.editingUser.set(user);
    this.showEditDialog.set(true);
  }

  closeEdit(): void {
    this.showEditDialog.set(false);
    this.editingUser.set(null);
  }

  openDelete(user: TeamUser): void {
    this.deletingUser.set(user);
    this.showDeleteConfirm.set(true);
  }

  closeDelete(): void {
    this.showDeleteConfirm.set(false);
    this.deletingUser.set(null);
  }

  openReset(user: TeamUser): void {
    this.resettingUser.set(user);
    this.showResetConfirm.set(true);
  }

  closeReset(): void {
    this.showResetConfirm.set(false);
    this.resettingUser.set(null);
  }

  onUsersAdded(added: TeamUser[]): void {
    this.users.update((prev) => [...prev, ...added]);
  }

  onUserUpdated(updated: TeamUser): void {
    this.users.update((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async confirmDelete(): Promise<void> {
    const target = this.deletingUser();
    if (!target) return;
    this.actionLoading.set(true);
    try {
      const bridge = this.authService.getBridgeAuth();
      await bridge.team.deleteUser(target.id);
      this.users.update((prev) => prev.filter((u) => u.id !== target.id));
      this.closeDelete();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete user');
      this.error.emit(e);
    } finally {
      this.actionLoading.set(false);
    }
  }

  async confirmReset(): Promise<void> {
    const target = this.resettingUser();
    if (!target) return;
    this.actionLoading.set(true);
    try {
      const bridge = this.authService.getBridgeAuth();
      await bridge.team.sendPasswordResetLink(target.id);
      this.closeReset();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to send reset link');
      this.error.emit(e);
    } finally {
      this.actionLoading.set(false);
    }
  }
}
