/**
 * TeamWorkspaceForm — Angular port of bridge-svelte's
 * `team/TeamWorkspaceForm.svelte` (and react's `TeamWorkspaceForm.tsx`).
 *
 * The Workspace tab: edits tenant-wide name + locale, shows logo / plan / MFA as
 * read-only. Loads via auth-core `getBridgeAuth().team.getWorkspace()` and saves
 * via `updateWorkspace({ name, locale })`.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; `onMount` load →
 * `ngOnInit`.
 */
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TeamWorkspace } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthAlertComponent } from '../sdk-auth/shared/alert.component';
import { AuthSpinnerComponent } from '../sdk-auth/shared/spinner.component';

@Component({
  selector: 'bridge-team-workspace-form',
  standalone: true,
  imports: [FormsModule, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <div [class]="className" [style]="style" data-bridge-team-workspace>
      <h3 class="bridge-team-section-title">Workspace Settings</h3>

      @if (loading()) {
        <div class="bridge-team-loading">
          <bridge-auth-spinner [size]="32" />
          <span>Loading workspace...</span>
        </div>
      } @else {
        @if (loadError()) {
          <div class="bridge-team-alert">
            <bridge-auth-alert variant="error">{{ loadError() }}</bridge-auth-alert>
          </div>
        }
        @if (success()) {
          <div class="bridge-team-alert">
            <bridge-auth-alert variant="success">{{ success() }}</bridge-auth-alert>
          </div>
        }

        @if (workspace()?.logo) {
          <div class="bridge-team-logo">
            <img [src]="workspace()!.logo" [alt]="(workspace()?.name ?? '') + ' logo'" />
          </div>
        }

        <form class="bridge-team-form" (ngSubmit)="submit()">
          <div class="bridge-team-form-group">
            <label for="bridge-workspace-name">Workspace Name</label>
            <input
              id="bridge-workspace-name"
              type="text"
              [(ngModel)]="name"
              name="name"
              [disabled]="saving()"
            />
          </div>

          <div class="bridge-team-form-group">
            <label for="bridge-workspace-locale">Locale</label>
            <input
              id="bridge-workspace-locale"
              type="text"
              [(ngModel)]="locale"
              name="locale"
              placeholder="en"
              [disabled]="saving()"
            />
          </div>

          @if (workspace()?.plan) {
            <div class="bridge-team-form-group">
              <label>Current Plan</label>
              <div class="bridge-team-readonly">{{ workspace()?.plan }}</div>
            </div>
          }

          <div class="bridge-team-form-group">
            <label>MFA</label>
            <div class="bridge-team-readonly">{{ workspace()?.mfa ? 'Enabled' : 'Disabled' }}</div>
          </div>

          <div class="bridge-team-form-actions">
            <button type="submit" class="bridge-btn bridge-btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class TeamWorkspaceFormComponent implements OnInit {
  @Input() className = '';
  @Input() style = '';
  @Output() error = new EventEmitter<Error>();

  protected readonly workspace = signal<TeamWorkspace | null>(null);
  protected name = '';
  protected locale = '';
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  private readonly authService = inject(AuthService);

  async ngOnInit(): Promise<void> {
    try {
      const bridge = this.authService.getBridgeAuth();
      const w = await bridge.team.getWorkspace();
      this.workspace.set(w);
      this.name = w.name ?? '';
      this.locale = w.locale ?? '';
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load workspace');
      this.loadError.set(e.message);
      this.error.emit(e);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.saving.set(true);
    this.loadError.set(null);
    this.success.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      await bridge.team.updateWorkspace({ name: this.name, locale: this.locale });
      this.success.set('Workspace updated successfully.');
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update workspace');
      this.loadError.set(e.message);
      this.error.emit(e);
    } finally {
      this.saving.set(false);
    }
  }
}
