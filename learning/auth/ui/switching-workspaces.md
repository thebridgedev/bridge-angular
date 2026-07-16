# Switching workspaces

Two components cover workspace selection (a workspace is called a *tenant* in the API, which is why some identifiers below say `tenant`):

- **`bridge-tenant-selector`**: part of the login flow. Lets a user pick which workspace to sign in to.
- **`bridge-workspace-selector`**: for an already signed-in user. Lets them switch the active workspace, for example from a settings page or sidebar.

Both only come into play when the user has **more than one enabled membership in an active tenant**. A membership that's been disabled, or a workspace that isn't active (for example, suspended for non-payment), doesn't count and won't be shown. A user with exactly one enabled-and-active membership goes straight in with no selector.

## TenantSelector

Lets a user with multiple workspaces pick one during login. It appears automatically inside `<bridge-login-form>` when `authState` becomes `'tenant-selection'` (see [Auth states](/auth/user-token/auth-states/)), so you normally don't wire anything. Use it standalone only if you're building a custom login flow.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(select)` | `EventEmitter<void>` | (none) | Called after a workspace is selected |
| `(error)` | `EventEmitter<Error>` | (none) | Called on error |

**Standalone usage:**

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, TenantSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-tenant-selection',
  standalone: true,
  imports: [TenantSelectorComponent],
  template: `
    @if (authService.authState() === 'tenant-selection') {
      <bridge-tenant-selector (select)="router.navigateByUrl('/dashboard')" />
    }
  `,
})
export class TenantSelectionComponent {
  protected readonly authService = inject(AuthService);
  protected readonly router = inject(Router);
}
```

It reads the available workspace memberships from the `AuthService.tenantUsers()` signal, the same list `<bridge-login-form>` uses.

## WorkspaceSelector

A drop-in switcher that lists the workspaces the signed-in user can access and switches the active one. On switch, the SDK issues a fresh session for the chosen workspace and refreshes the whole `BridgeService` in one update, including the user's role, which may differ in the new workspace.

**Inputs & outputs:**

| Input / output | Type | Default | Description |
|------|------|---------|-------------|
| `(switched)` | `EventEmitter<void>` | (none) | Called after the active workspace changes |
| `(error)` | `EventEmitter<Error>` | (none) | Called on switch error |

**Usage:**

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-workspaces',
  standalone: true,
  imports: [WorkspaceSelectorComponent],
  template: `
    <bridge-workspace-selector
      (switched)="router.navigateByUrl('/')"
      (error)="onError($event)"
    />
  `,
})
export class WorkspacesPageComponent {
  protected readonly router = inject(Router);

  onError(err: Error): void {
    console.error(err);
  }
}
```

**Styling the rows**: the list renders stable `data-bridge-workspace-*` attributes (`data-bridge-workspace-item`, `data-bridge-workspace-avatar`, `data-bridge-workspace-name`, `data-bridge-workspace-user`, plus `data-active` / `data-loading` state markers) that you can target with CSS. There's no template-projection hook for replacing the row markup itself.

For the concept behind all of this (what a workspace is, how isolation works), see [Multi-tenancy](/auth/multi-tenancy/).
