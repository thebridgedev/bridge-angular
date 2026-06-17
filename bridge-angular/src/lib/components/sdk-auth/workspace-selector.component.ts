/**
 * WorkspaceSelector — Angular port of bridge-svelte's
 * `sdk-auth/WorkspaceSelector.svelte`.
 *
 * Post-login workspace switcher: lists workspaces via `getWorkspaces()` and
 * switches via `switchWorkspace(id)`. Mirrors react's `WorkspaceSelector.tsx`
 * (raw `data-bridge-workspace-*` markup — no AuthFormWrapper shell).
 *
 * Reactive translation (§5.1): react's `useBridgeStore((s) => s.profile)` →
 * the `AuthService.profile` signal; `useEffect` load → `ngOnInit`.
 */
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { Workspace } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-workspace-selector',
  standalone: true,
  imports: [AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <div
      [class]="className"
      [style]="style"
      data-bridge-workspace-selector
      [attr.data-loading-list]="loadingList()"
    >
      @if (loadError() || switchError()) {
        <bridge-auth-alert variant="error">{{ loadError() ?? switchError() }}</bridge-auth-alert>
      }

      @if (loadingList()) {
        <div data-bridge-workspace-loading>
          <bridge-auth-spinner [size]="24" />
        </div>
      } @else {
        <div data-bridge-workspace-list>
          @for (ws of workspaces(); track ws.id) {
            <button
              type="button"
              data-bridge-workspace-item
              [attr.data-tenant-id]="ws.tenant.id"
              [attr.data-active]="ws.id === currentWorkspaceId()"
              [attr.data-loading]="switchingId() === ws.id"
              [disabled]="!!switchingId()"
              (click)="handleSelect(ws)"
            >
              <span data-bridge-workspace-avatar>
                @if (ws.tenant.logo) {
                  <img [src]="ws.tenant.logo" [alt]="ws.tenant.name" />
                } @else {
                  {{ initial(ws.tenant.name) }}
                }
              </span>
              <span data-bridge-workspace-info>
                <span data-bridge-workspace-name>{{ ws.tenant.name }}</span>
                <span data-bridge-workspace-user>{{ ws.fullName }}</span>
              </span>
              @if (switchingId() === ws.id) {
                <bridge-auth-spinner [size]="18" />
              }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class WorkspaceSelectorComponent implements OnInit {
  @Input() className = '';
  @Input() style = '';
  @Output() switched = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);
  private readonly profile = this.authService.profile;
  protected readonly currentWorkspaceId = computed(() => this.profile()?.id ?? null);

  protected readonly workspaces = signal<Workspace[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadingList = signal(true);
  protected readonly switchingId = signal<string | null>(null);
  protected readonly switchError = signal<string | null>(null);

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  async ngOnInit(): Promise<void> {
    try {
      const ws = await (this.authService.getBridgeAuth() as any).getWorkspaces();
      this.workspaces.set(ws);
    } catch (err: any) {
      this.loadError.set(err.message || 'Failed to load workspaces.');
    } finally {
      this.loadingList.set(false);
    }
  }

  async handleSelect(workspace: Workspace): Promise<void> {
    if (this.switchingId()) return;
    this.switchError.set(null);
    this.switchingId.set(workspace.id);
    try {
      await (this.authService.getBridgeAuth() as any).switchWorkspace(workspace.id);
      this.switched.emit();
    } catch (err: any) {
      this.switchError.set(err.message || 'Failed to switch workspace.');
      this.error.emit(err);
    } finally {
      this.switchingId.set(null);
    }
  }
}
