import { Component } from '@angular/core';
import { WorkspaceSelectorComponent } from '@nebulr-group/bridge-angular';

/**
 * Mirrors bridge-svelte's `routes/workspaces` and react's `WorkspacesPage.tsx`.
 * Lets the user switch between workspaces they have access to. Route protection
 * is handled by the parent guard.
 */
@Component({
  selector: 'app-workspaces',
  standalone: true,
  imports: [WorkspaceSelectorComponent],
  template: `
    <div class="workspaces-page">
      <h1>Workspaces</h1>
      <p class="subtitle">Switch between workspaces you have access to.</p>
      <bridge-workspace-selector (switched)="onSwitched()" (error)="onError($event)" />
    </div>
  `,
  styles: [`
    .workspaces-page { padding: 2rem; max-width: 480px; }
    h1 { margin-bottom: 0.5rem; color: #1f2937; }
    .subtitle { margin-bottom: 1.5rem; color: #6b7280; font-size: 0.875rem; }
  `],
})
export class WorkspacesComponent {
  onSwitched(): void {
    // Full reload so all reactive state resets to the new workspace's context.
    window.location.reload();
  }

  onError(err: Error): void {
    console.error('[Workspaces]', err);
  }
}
