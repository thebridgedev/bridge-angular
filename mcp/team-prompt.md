# Bridge Angular — Team Management

You are adding team management to an Angular application that uses The Bridge.

## Decide first — how much do you want to build?

| You want | Use | Effort |
|---|---|---|
| A complete team settings page | `<bridge-team-panel>` | One component |
| Only the member list | `<bridge-team-user-list>` | One component |
| Only profile / workspace forms | `TeamProfileFormComponent`, `TeamWorkspaceFormComponent` | One each |
| Your own layout, Bridge's dialogs | The individual pieces below | Moderate |
| Your own everything | Bridge management API from your backend | Do not — see below |

**Start at the top and only move down when a requirement forces it.** The panel already handles invite, role change, removal, confirmation dialogs, loading and error states, and stays correct as the role model changes.

> **Do not build team CRUD in your own backend and proxy to it.** These components talk to Bridge directly with the signed-in user's token, and Bridge enforces who may do what. A proxy adds a hop, a second place for role logic to drift, and a new way to leak another workspace's members. The backend plugins (`bridge-nestjs`, `bridge-express`) expose no team CRUD for exactly this reason.

## Prerequisites

1. `@nebulr-group/bridge-angular` installed.
2. `provideBridge(bridgeConfig)` in `appConfig.providers` (see `integration-prompt.md`).
3. The route is behind auth — team management needs a signed-in user.

## The whole panel

Standalone component; import it directly:

```ts
// src/app/settings/team-page.component.ts
import { Component } from '@angular/core';
import { TeamManagementPanelComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-team-page',
  standalone: true,
  imports: [TeamManagementPanelComponent],
  template: `
    <h1>Team settings</h1>
    <bridge-team-panel />
  `,
})
export class TeamPageComponent {}
```

Three tabs: **Users** (list, invite, re-role, remove), **Profile**, **Workspace**.

### A custom tab bar

`TeamTabBarDirective` (`[bridgeTeamTabBar]`) lets you replace the tab bar without giving up the panel — use it as a structural template rather than forking the component.

## The individual pieces

Use these when the panel's layout genuinely does not fit. They are what the panel composes:

| Component | Purpose |
|---|---|
| `TeamUserListComponent` | Member list with row actions |
| `TeamAddUserDialogComponent` | Invite a member |
| `TeamEditUserDialogComponent` | Change a member's role |
| `TeamProfileFormComponent` | Current user's profile |
| `TeamWorkspaceFormComponent` | Workspace settings |

> This panel **replaced** a legacy iframe/handover `TeamManagementComponent`. If you find a guide or an older app embedding team management in an iframe, that is the superseded approach — do not copy it.

## Who is allowed to do what

Bridge enforces this server-side from the caller's role and privileges. The components surface it; they do not decide it. `OWNER` and `ADMIN` can manage members; a plain member cannot.

> **Hiding a button is not a permission check.** Conditional rendering is UX only. The boundary is the server's check against the verified token, and it is already there.

To change what a role may do, edit its privileges over MCP (`update_role`) or the CLI (`bridge role update`) — not in app code.

## Managing members outside the UI

For scripts, seeding and migrations:

| Task | MCP | CLI |
|---|---|---|
| List workspaces | `list_tenants` | `bridge tenant list` |
| Create a workspace | `create_tenant` | `bridge tenant create` |
| Add a member | `create_tenant_user` | `bridge user invite` |
| Change a role | `update_tenant_user` | `bridge user update` |
| Remove a member | `delete_tenant_user` | `bridge user delete` |

Deletions need a token carrying the matching destructive privilege. A default `bridge auth login` token has none by design — `bridge auth login --admin` requests them.

## Common mistakes

- **Rebuilding the member list from your own API.** A copy in your database goes stale the moment someone is removed — and the stale copy is what your check reads.
- **Rendering the panel on a public route.** It needs an authenticated user.
- **Expecting an NgModule.** These are standalone components.
- **Assuming "team" means one fixed workspace.** A user can belong to several; the panel operates on the selected one.

## Related guides

- `integration-prompt.md` — `provideBridge`, route guard
- `sdk-auth-prompt.md` — login, signup, workspace selection
- `billing-prompt.md` — plans and quotas, which are per-workspace
