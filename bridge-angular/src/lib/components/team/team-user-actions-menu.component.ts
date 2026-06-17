/**
 * TeamUserActionsMenu — Angular port of bridge-svelte's
 * `team/TeamUserActionsMenu.svelte` (and react's `TeamUserActionsMenu.tsx`).
 *
 * The three-dot kebab menu on each team-user row. Emits `edit` /
 * `resetPassword` / `delete`. Closes on outside click via a host listener.
 *
 * Reactive translation (§5.1): svelte `$state` open flag → signal; react's
 * `useEffect` document click listener → Angular `@HostListener('document:click')`.
 */
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';

@Component({
  selector: 'bridge-team-user-actions-menu',
  standalone: true,
  template: `
    <div [class]="className" [style]="style" data-bridge-team-actions>
      <button
        type="button"
        class="bridge-team-actions-trigger"
        (click)="toggle($event)"
        aria-label="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      @if (isOpen()) {
        <div class="bridge-team-actions-menu">
          <button
            type="button"
            class="bridge-team-actions-item"
            (click)="run(edit)"
          >
            Edit
          </button>
          <button
            type="button"
            class="bridge-team-actions-item"
            (click)="run(resetPassword)"
          >
            Reset Password
          </button>
          <button
            type="button"
            class="bridge-team-actions-item bridge-team-actions-item--danger"
            (click)="run(delete)"
          >
            Delete
          </button>
        </div>
      }
    </div>
  `,
})
export class TeamUserActionsMenuComponent {
  @Input() className = '';
  @Input() style = '';

  @Output() edit = new EventEmitter<void>();
  @Output() resetPassword = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

  protected readonly isOpen = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen.update((v) => !v);
  }

  run(emitter: EventEmitter<void>): void {
    this.isOpen.set(false);
    emitter.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }
}
