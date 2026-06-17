import { Component } from '@angular/core';
import {
  TeamManagementPanelComponent,
  TeamTabBarDirective,
} from '@nebulr-group/bridge-angular';

/**
 * Mirrors bridge-svelte's `routes/team-panel/+page.svelte` and react's
 * `TeamPanelPage.tsx`:
 *   - Renders the native `<bridge-team-panel>` (no iframe, direct GraphQL).
 *   - Provides a custom tab bar via the projected `*bridgeTeamTabBar`
 *     `ng-template` using `.my-tabs` / `.my-tab` classes (the e2e spec targets
 *     these). The implicit context exposes `{ tabs, activeTab, setTab }`.
 *
 * Route protection is handled by the parent guard.
 */
@Component({
  selector: 'app-team-panel',
  standalone: true,
  imports: [TeamManagementPanelComponent, TeamTabBarDirective],
  template: `
    <div class="team-panel-page">
      <h1>Team Management (Native SDK)</h1>
      <p class="subtitle">
        This uses the native <code>&lt;bridge-team-panel&gt;</code> component — no iframe,
        direct GraphQL.
      </p>

      <bridge-team-panel (error)="onError($event)">
        <ng-template bridgeTeamTabBar let-ctx>
          <nav class="my-tabs">
            @for (tab of ctx.tabs; track tab.id) {
              <button
                type="button"
                class="my-tab"
                [class.my-tab--active]="ctx.activeTab === tab.id"
                (click)="ctx.setTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            }
          </nav>
        </ng-template>
      </bridge-team-panel>
    </div>
  `,
  styles: [`
    .team-panel-page { padding: 2rem; }
    h1 { margin-bottom: 0.5rem; color: #1f2937; }
    .subtitle { margin-bottom: 2rem; color: #6b7280; font-size: 0.875rem; }
    code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.8125rem; }
    .my-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #e5e7eb;
    }
    .my-tab {
      padding: 0.5rem 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.375rem;
      background: #f9fafb;
      color: #6b7280;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .my-tab:hover { border-color: #3b82f6; color: #3b82f6; }
    .my-tab--active { background: #3b82f6; border-color: #3b82f6; color: #ffffff; }
  `],
})
export class TeamPanelComponent {
  onError(err: Error): void {
    console.error('[TeamPanel]', err);
  }
}
