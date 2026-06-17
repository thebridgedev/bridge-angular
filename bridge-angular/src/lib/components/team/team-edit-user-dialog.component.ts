/**
 * TeamEditUserDialog — Angular port of bridge-svelte's
 * `team/TeamEditUserDialog.svelte` (and react's `TeamEditUserDialog.tsx`).
 *
 * Native `<dialog>` for editing a single team user's role and enabled flag.
 * Calls auth-core `getBridgeAuth().team.updateUser` and emits the updated user
 * via `updated`.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; the `open`/`user` sync
 * (which re-seeds the form fields) runs in the `open`/`user` setters.
 */
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TeamUser } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthAlertComponent } from '../sdk-auth/shared/alert.component';

@Component({
  selector: 'bridge-team-edit-user-dialog',
  standalone: true,
  imports: [FormsModule, AuthAlertComponent],
  template: `
    <dialog
      #dialogEl
      [class]="className"
      [style]="style"
      data-bridge-team-dialog
      (close)="onClose()"
    >
      <div class="bridge-team-dialog-content">
        <h3 class="bridge-team-dialog-title">Edit User</h3>
        @if (user) {
          <p class="bridge-team-dialog-subtitle">{{ user.email }}</p>
        }

        @if (error()) {
          <div class="bridge-team-dialog-error">
            <bridge-auth-alert variant="error">{{ error() }}</bridge-auth-alert>
          </div>
        }

        <div class="bridge-team-form-group">
          <label for="bridge-edit-role">Role</label>
          <select id="bridge-edit-role" [(ngModel)]="selectedRole" [disabled]="loading()">
            @for (role of roles; track role) {
              <option [value]="role">{{ role }}</option>
            }
          </select>
        </div>

        <div class="bridge-team-form-group">
          <label class="bridge-team-checkbox-label">
            <input type="checkbox" [(ngModel)]="enabled" [disabled]="loading()" />
            <span>Enabled</span>
          </label>
        </div>

        <div class="bridge-team-dialog-actions">
          <button
            type="button"
            class="bridge-btn bridge-btn-secondary"
            (click)="onClose()"
            [disabled]="loading()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="bridge-btn bridge-btn-primary"
            (click)="submit()"
            [disabled]="loading()"
          >
            {{ loading() ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class TeamEditUserDialogComponent implements AfterViewInit, OnDestroy {
  @Input() className = '';
  @Input() style = '';
  @Input() user: TeamUser | null = null;
  @Input() roles: string[] = [];

  @Input()
  set open(value: boolean) {
    this._open = value;
    this.syncDialog();
  }
  get open(): boolean {
    return this._open;
  }
  private _open = false;

  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<TeamUser>();

  protected selectedRole = '';
  protected enabled = true;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  @ViewChild('dialogEl') private dialogRef!: ElementRef<HTMLDialogElement>;
  private viewReady = false;
  private readonly authService = inject(AuthService);

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.syncDialog();
  }

  ngOnDestroy(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  private syncDialog(): void {
    if (!this.viewReady) return;
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;
    if (this._open && !dialog.open) {
      this.selectedRole = this.user?.role ?? '';
      this.enabled = this.user?.enabled ?? true;
      this.error.set(null);
      dialog.showModal();
    } else if (!this._open && dialog.open) {
      dialog.close();
    }
  }

  async submit(): Promise<void> {
    if (!this.user) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      const updated = await bridge.team.updateUser({
        id: this.user.id,
        role: this.selectedRole || undefined,
        enabled: this.enabled,
      });
      this.updated.emit(updated);
      this.close.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      this.loading.set(false);
    }
  }

  onClose(): void {
    this.close.emit();
  }
}
