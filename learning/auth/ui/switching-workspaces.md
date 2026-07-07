# Switching workspaces

## WorkspaceSelector

A drop-in switcher (`bridge-workspace-selector` / `WorkspaceSelectorComponent`) that lists the workspaces the signed-in user can access and switches the active one. On switch, the SDK re-issues a session for the chosen tenant and the `AuthService` signals re-snapshot.

**Props:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Forwarded to the root element's `class` |
| `style` | `string` | `''` | Forwarded to the root element's `style` |

| Output | Type | Description |
|--------|------|-------------|
| `switched` | `EventEmitter<void>` | Emitted after the active workspace changes |
| `error` | `EventEmitter<Error>` | Emitted on switch error |

**Usage:**

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-switch-workspace',
  standalone: true,
  imports: [WorkspaceSelectorComponent],
  template: `
    <bridge-workspace-selector
      (switched)="onSwitched()"
      (error)="onError($event)"
    />
  `,
})
export class SwitchWorkspaceComponent {
  private readonly router = inject(Router);

  onSwitched(): void {
    this.router.navigateByUrl('/');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

There's no custom-row-markup slot today — the list renders fixed `data-bridge-workspace-*` markup (`data-bridge-workspace-item`, `data-bridge-workspace-avatar`, `data-bridge-workspace-name`, etc.) that you can target with CSS, but there's no template-projection hook for swapping the row layout itself.

## TenantSelector at login

When a user's credentials map to more than one tenant, `bridge-login-form` surfaces a `bridge-tenant-selector` step automatically so they pick which workspace to enter. You don't wire anything — it appears when `AuthService.authState()` becomes `'tenant-selection'`. See [Auth states](/auth/user-token/auth-states/) for the full list of states.

`bridge-tenant-selector` (`TenantSelectorComponent`) is also exported directly if you're building a fully custom login flow:

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Forwarded to the form wrapper's `class` |
| `style` | `string` | `''` | Forwarded to the form wrapper's `style` |

| Output | Type | Description |
|--------|------|-------------|
| `select` | `EventEmitter<void>` | Emitted after a tenant is selected |
| `error` | `EventEmitter<Error>` | Emitted on selection error |

It reads the available tenant memberships from `AuthService.tenantUsers()` and completes the switch via the underlying `selectTenant(id)` call.
