/**
 * TeamManagementPanel — Angular port of bridge-svelte's
 * `team/TeamManagementPanel.svelte` (and react's `TeamManagementPanel.tsx`).
 *
 * In-app team-management surface (SDK era, §2.6) — NO iframe / handover. Renders
 * three tabs (Users / Profile / Workspace) backed by auth-core's `TeamService`.
 * Hard-replaces the legacy `<bridge-team-management>` handover component.
 *
 * Custom tab bar: svelte's `tabBar` snippet → Angular content projection via an
 * `ng-template` with the `bridgeTeamTabBar` directive. The template's implicit
 * context is `{ tabs, activeTab, setTab }`, mirroring the svelte/react render
 * prop. When no template is projected, the default tab bar renders.
 *
 *   <bridge-team-panel>
 *     <ng-template bridgeTeamTabBar let-ctx>
 *       <nav>... use ctx.tabs / ctx.activeTab / ctx.setTab ...</nav>
 *     </ng-template>
 *   </bridge-team-panel>
 *
 * Reactive translation (§5.1): svelte `$state`/`$derived` → signal/computed.
 */
import {
  Component,
  ContentChild,
  Directive,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  computed,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TeamProfileFormComponent } from './team-profile-form.component';
import { TeamUserListComponent } from './team-user-list.component';
import { TeamWorkspaceFormComponent } from './team-workspace-form.component';

type TabId = 'users' | 'profile' | 'workspace';
type Tab = { id: TabId; label: string };

/**
 * Marks an `<ng-template>` projected into `<bridge-team-panel>` as the custom
 * tab-bar renderer. The template receives `{ tabs, activeTab, setTab }` as its
 * implicit context.
 */
@Directive({ selector: '[bridgeTeamTabBar]', standalone: true })
export class TeamTabBarDirective {}

@Component({
  selector: 'bridge-team-panel',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    TeamUserListComponent,
    TeamProfileFormComponent,
    TeamWorkspaceFormComponent,
  ],
  template: `
    <div [class]="className" [style]="style" data-bridge-team-panel>
      @if (tabs().length > 1) {
        @if (tabBarTemplate) {
          <ng-container
            [ngTemplateOutlet]="tabBarTemplate"
            [ngTemplateOutletContext]="{ $implicit: tabBarContext(), tabs: tabs(), activeTab: activeTab(), setTab: setTabFn }"
          ></ng-container>
        } @else {
          <nav class="bridge-team-tabs">
            @for (tab of tabs(); track tab.id) {
              <button
                type="button"
                class="bridge-team-tab"
                [attr.data-active]="activeTab() === tab.id"
                (click)="setTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            }
          </nav>
        }
      }

      <div class="bridge-team-tab-content">
        @if (activeTab() === 'users') {
          <bridge-team-user-list (error)="onError($event)" />
        } @else if (activeTab() === 'profile') {
          <bridge-team-profile-form (error)="onError($event)" />
        } @else if (activeTab() === 'workspace') {
          <bridge-team-workspace-form (error)="onError($event)" />
        }
      </div>
    </div>
  `,
})
export class TeamManagementPanelComponent {
  @Input() className = '';
  @Input() style = '';

  @Input()
  set defaultTab(value: TabId) {
    this.activeTab.set(value);
  }

  @Input() showProfileTab = true;
  @Input() showWorkspaceTab = true;

  @Output() error = new EventEmitter<Error>();

  @ContentChild(TeamTabBarDirective, { read: TemplateRef })
  protected tabBarTemplate?: TemplateRef<unknown>;

  protected readonly activeTab = signal<TabId>('users');

  protected readonly tabs = computed<Tab[]>(() =>
    [
      { id: 'users' as const, label: 'Users' },
      this.showProfileTab && { id: 'profile' as const, label: 'Profile' },
      this.showWorkspaceTab && { id: 'workspace' as const, label: 'Workspace' },
    ].filter(Boolean) as Tab[],
  );

  /** Bound function so the projected tab-bar template can call `setTab(id)`. */
  protected readonly setTabFn = (id: string): void => this.setTab(id as TabId);

  protected tabBarContext(): { tabs: Tab[]; activeTab: TabId; setTab: (id: string) => void } {
    return { tabs: this.tabs(), activeTab: this.activeTab(), setTab: this.setTabFn };
  }

  protected setTab(id: TabId): void {
    this.activeTab.set(id);
  }

  protected onError(err: Error): void {
    this.error.emit(err);
  }
}
