/**
 * TeamAddUserDialog — Angular port of bridge-svelte's
 * `team/TeamAddUserDialog.svelte` (and react's `TeamAddUserDialog.tsx`).
 *
 * Native `<dialog>` for inviting one or more team members by email
 * (comma/newline separated). Calls auth-core `getBridgeAuth().team.createUsers`
 * and emits the created users via `added`.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; `$effect` open sync →
 * `effect()` over the `open` setter.
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
  selector: 'bridge-team-add-user-dialog',
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
        <h3 class="bridge-team-dialog-title">Add Team Members</h3>
        <p class="bridge-team-dialog-subtitle">
          Enter email addresses separated by commas or new lines.
        </p>

        @if (error()) {
          <div class="bridge-team-dialog-error">
            <bridge-auth-alert variant="error">{{ error() }}</bridge-auth-alert>
          </div>
        }

        <div class="bridge-team-form-group">
          <label for="bridge-add-emails">Email addresses</label>
          <textarea
            id="bridge-add-emails"
            [(ngModel)]="emailsText"
            placeholder="user1@example.com&#10;user2@example.com"
            rows="4"
            [disabled]="loading()"
          ></textarea>
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
            [disabled]="loading() || !emailsText.trim()"
          >
            {{ loading() ? 'Adding...' : 'Add Members' }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class TeamAddUserDialogComponent implements AfterViewInit, OnDestroy {
  @Input() className = '';
  @Input() style = '';

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
  @Output() added = new EventEmitter<TeamUser[]>();

  protected emailsText = '';
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
      this.emailsText = '';
      this.error.set(null);
      dialog.showModal();
    } else if (!this._open && dialog.open) {
      dialog.close();
    }
  }

  async submit(): Promise<void> {
    const emails = this.emailsText
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      this.error.set('Please enter at least one email address.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      const created = await bridge.team.createUsers(emails);
      this.added.emit(created);
      this.close.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to add users');
    } finally {
      this.loading.set(false);
    }
  }

  onClose(): void {
    this.close.emit();
  }
}
