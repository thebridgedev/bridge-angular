# User & team management

## TeamManagementPanel

A drop-in panel for managing team members, team profile, and workspace settings. Renders three tabs: **Users**, **Profile**, and **Workspace**.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `(error)` | `EventEmitter<Error>` | (none) | Called on any error |

**Usage:**

```typescript
// src/app/pages/settings/team.component.ts
import { Component } from '@angular/core';
import { TeamManagementPanelComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-team-settings',
  standalone: true,
  imports: [TeamManagementPanelComponent],
  template: `
    <bridge-team-panel
      defaultTab="users"
      (error)="onError($event)"
    />
  `,
})
export class TeamSettingsComponent {
  onError(err: Error): void {
    console.error(err);
  }
}
```

**Custom tab bar:**

> **Framework note:** instead of a snippet prop, project an `<ng-template>`
> marked with the `bridgeTeamTabBar` directive. Its context provides
> `{ tabs, activeTab, setTab }`.

```typescript
import { Component } from '@angular/core';
import { TeamManagementPanelComponent, TeamTabBarDirective } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-team-settings',
  standalone: true,
  imports: [TeamManagementPanelComponent, TeamTabBarDirective],
  template: `
    <bridge-team-panel>
      <ng-template bridgeTeamTabBar let-ctx>
        <nav class="custom-tabs">
          @for (tab of ctx.tabs; track tab.id) {
            <button
              [class.active]="ctx.activeTab === tab.id"
              (click)="ctx.setTab(tab.id)"
            >
              {{ tab.label }}
            </button>
          }
        </nav>
      </ng-template>
    </bridge-team-panel>
  `,
})
export class TeamSettingsComponent {}
```

The panel includes:
- **Users tab**: list team members, invite new users, update roles, remove members.
- **Profile tab**: update team name and other profile fields.
- **Workspace tab**: update workspace settings.

## Individual tab components

Each tab is also exported as a standalone component. Use these when you only need one piece of team management, or want to build your own layout:

```typescript
import { Component } from '@angular/core';
import {
  TeamUserListComponent,
  TeamProfileFormComponent,
  TeamWorkspaceFormComponent,
} from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-custom-team-layout',
  standalone: true,
  imports: [TeamUserListComponent, TeamProfileFormComponent, TeamWorkspaceFormComponent],
  template: `
    <!-- Just the user list -->
    <bridge-team-user-list (error)="onError($event)" />

    <!-- Just the profile form -->
    <bridge-team-profile-form (error)="onError($event)" />

    <!-- Just the workspace settings -->
    <bridge-team-workspace-form (error)="onError($event)" />
  `,
})
export class CustomTeamLayoutComponent {
  onError(err: Error): void {
    console.error(err);
  }
}
```

All three accept `className` and `style` inputs, and emit an `error` output.
