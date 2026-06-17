/**
 * TeamConfirmDialog — Angular port of bridge-svelte's
 * `team/TeamConfirmDialog.svelte` (and react's `TeamConfirmDialog.tsx`).
 *
 * A generic confirm modal built on the native `<dialog>` element. Used by
 * `<bridge-team-user-list>` for the delete and reset-password confirmations.
 * `data-variant` ("danger" | "default") lets the shipped `styles.css` theme the
 * confirm button. Title/message/actions can be overridden via content
 * projection (`title` / `actions` slots) for full control.
 *
 * Reactive translation (§5.1): svelte `$props` → `@Input`/`@Output`; the
 * `open`/`dialog.showModal()` sync runs in an `effect()`.
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
} from '@angular/core';

@Component({
  selector: 'bridge-team-confirm-dialog',
  standalone: true,
  template: `
    <dialog
      #dialogEl
      [class]="className"
      [style]="style"
      data-bridge-team-dialog
      [attr.data-variant]="variant"
      (close)="onCancel()"
    >
      <div class="bridge-team-dialog-content">
        <h3 class="bridge-team-dialog-title">{{ title }}</h3>
        <p class="bridge-team-dialog-message">{{ message }}</p>

        <div class="bridge-team-dialog-actions">
          <button
            type="button"
            class="bridge-btn bridge-btn-secondary"
            (click)="onCancel()"
            [disabled]="loading"
          >
            Cancel
          </button>
          <button
            type="button"
            class="bridge-btn"
            [class.bridge-btn-danger]="variant === 'danger'"
            [class.bridge-btn-primary]="variant !== 'danger'"
            (click)="onConfirm()"
            [disabled]="loading"
          >
            {{ loading ? 'Processing...' : confirmLabel }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class TeamConfirmDialogComponent implements AfterViewInit, OnDestroy {
  @Input() title = 'Confirm';
  @Input() message = 'Are you sure?';
  @Input() confirmLabel = 'Confirm';
  @Input() variant: 'danger' | 'default' = 'danger';
  @Input() loading = false;
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

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('dialogEl') private dialogRef!: ElementRef<HTMLDialogElement>;
  private viewReady = false;

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
    if (this._open && !dialog.open) dialog.showModal();
    else if (!this._open && dialog.open) dialog.close();
  }

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
