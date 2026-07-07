# User & team management

## TeamManagementPanel

A drop-in panel (`bridge-team-panel` / `TeamManagementPanelComponent`) for managing team members, team profile, and workspace settings. Renders three tabs: **Users**, **Profile**, and **Workspace**.

**Props:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `className` | `string` | `''` | Forwarded to the root element's `class` |
| `style` | `string` | `''` | Forwarded to the root element's `style` |

| Output | Type | Description |
|--------|------|-------------|
| `error` | `EventEmitter<Error>` | Emitted on any error from the active tab |

**Usage:**

```ts
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

**Custom tab bar** — project an `<ng-template>` marked with the `bridgeTeamTabBar` directive. Its implicit context provides `{ tabs, activeTab, setTab }`:

```ts
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
- **Users tab** (`bridge-team-user-list`) — list team members, invite new users, update roles, reset passwords, and remove members (all with confirmation dialogs).
- **Profile tab** (`bridge-team-profile-form`) — update the current user's first/last name; email and role are shown read-only.
- **Workspace tab** (`bridge-team-workspace-form`) — update workspace name and locale; logo, plan, and MFA status are shown read-only.

## Individual tab components

Each tab is also exported as a standalone component. Use these when you only need one piece of team management, or want to build your own layout:

```ts
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

`bridge-team-user-list` composes several internal dialogs to power add/edit/delete/reset-password flows — `TeamAddUserDialogComponent`, `TeamEditUserDialogComponent`, `TeamConfirmDialogComponent`, and `TeamUserActionsMenuComponent`. These are also exported from `@nebulr-group/bridge-angular` for advanced consumers assembling a fully custom user-management UI, but you don't need to use them directly for the drop-in components above.
