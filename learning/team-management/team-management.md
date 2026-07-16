# Team Management

The SDK team panel renders directly inside your app: no redirect to a separate portal,
no iframe. It is backed by auth-core's `TeamService`.

## Minimum integration

```ts
import { Component } from '@angular/core';
import { TeamManagementPanelComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [TeamManagementPanelComponent],
  template: `<bridge-team-panel />`,
})
export class TeamComponent {}
```

That single component handles:
- **Users tab**: list, add (`<bridge-team-add-user-dialog>`), edit role/enabled
  (`<bridge-team-edit-user-dialog>`), reset password, delete.
- **Profile tab**: `<bridge-team-profile-form>` for the current user.
- **Workspace tab**: `<bridge-team-workspace-form>` for tenant-wide settings.

## Toggling tabs

```html
<bridge-team-panel defaultTab="profile" [showWorkspaceTab]="false" />
```

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `error` (output) | `EventEmitter<Error>` | (none) | Emitted on any error |

## Using sub-components directly

Each tab is also exported as a standalone component; use these when you only need one
piece, or want to build your own layout:

```ts
import {
  TeamUserListComponent,
  TeamProfileFormComponent,
  TeamWorkspaceFormComponent,
} from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-custom-team',
  standalone: true,
  imports: [TeamUserListComponent, TeamProfileFormComponent, TeamWorkspaceFormComponent],
  template: `
    <bridge-team-user-list />
    <bridge-team-profile-form />
    <bridge-team-workspace-form />
  `,
})
export class CustomTeamComponent {}
```

## Custom tab bar

Svelte's `tabBar` render snippet maps to Angular content projection. Project an
`<ng-template>` marked with the `bridgeTeamTabBar` directive; its implicit context exposes
`{ tabs, activeTab, setTab }`:

```ts
import {
  TeamManagementPanelComponent,
  TeamTabBarDirective,
} from '@nebulr-group/bridge-angular';

@Component({
  standalone: true,
  imports: [TeamManagementPanelComponent, TeamTabBarDirective],
  template: `
    <bridge-team-panel>
      <ng-template bridgeTeamTabBar let-ctx>
        <nav class="my-tabs">
          @for (tab of ctx.tabs; track tab.id) {
            <button
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
  `,
})
export class CustomTabbedTeamComponent {}
```

## Error handling

```html
<bridge-team-panel (error)="onTeamError($event)" />
```

## Auth-core methods used

Internally calls `getBridgeAuth().team.*` (available via `AuthService`):
- `listUsers()`, `listUserRoles()`
- `createUsers(emails)`
- `updateUser({ id, role, enabled })`
- `deleteUser(id)`
- `sendPasswordResetLink(id)`
- `getProfile()`, `updateProfile({ firstName, lastName })`
- `getWorkspace()`, `updateWorkspace({ name, locale })`

You can also import `TeamService` (and the `TeamUser` / `TeamProfile` / `TeamWorkspace`
types) from `@nebulr-group/bridge-angular` if you build a fully custom UI.

## Common pitfalls

- **Empty user list:** the user must be authenticated AND have permission to list team
  members (usually `admin` role).
- **Add-user dialog accepts comma- or newline-separated emails.** Anything else fails
  validation.
- **Updates to the workspace** require admin privileges. Non-admins see the workspace tab
  but get a permission error on save.
