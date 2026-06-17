import { Component } from '@angular/core';
import { TeamManagementPanelComponent } from '@nebulr-group/bridge-angular';

/**
 * Mirrors bridge-svelte's default team page and react's `TeamPage.tsx`:
 * renders the native `<bridge-team-panel>` (no iframe, direct GraphQL via
 * auth-core's TeamService). Route protection is handled by the parent guard.
 */
@Component({
  selector: 'app-team',
  standalone: true,
  imports: [TeamManagementPanelComponent],
  template: `
    <div class="team-page">
      <h1>Team Management</h1>
      <p class="subtitle">
        The <code>&lt;bridge-team-panel&gt;</code> component renders team UI natively in-app.
        See <code>/team-panel</code> for a custom-tabbed example and <code>/workspaces</code>
        for workspace switching.
      </p>
      <bridge-team-panel (error)="onError($event)" />
    </div>
  `,
  styles: [`
    .team-page { padding: 2rem; }
    h1 { margin-bottom: 0.5rem; color: #1f2937; }
    .subtitle { margin-bottom: 2rem; color: #6b7280; font-size: 0.875rem; }
    code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.8125rem; }
  `],
})
export class TeamComponent {
  onError(err: Error): void {
    console.error('[Team]', err);
  }
}
