# Multi-tenancy

Bridge has first-class multi-tenant architecture: a user can belong to more than one **tenant** (also called a **workspace** — Bridge and these docs use both words for the same thing).

The same login credentials get a user into every tenant they belong to, but everything tenant-scoped is configured *separately* per tenant — role, plan, entitlements, quotas, and branding can all differ. The same person can be `ADMIN` in one workspace and `OWNER` in another, signing in with the exact same email and password either way.

`bridge.user().role` (see [Getting the user token](/auth/user-token/getting-the-token/)) always reflects that person's role in whichever tenant is currently active — switch tenants and it updates to the role they hold there. Roles are assigned per tenant too — see [Assign roles to users](/auth/roles/assign-roles/).

## The active tenant

The current workspace is exposed live on the injectable `BridgeService`:

```ts
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-workspace-badge',
  standalone: true,
  template: `<p>Workspace: {{ bridge.tenant.name() }} ({{ bridge.tenant.id() }})</p>`,
})
export class WorkspaceBadgeComponent {
  protected readonly bridge = inject(BridgeService);
}
```

`bridge.tenant.*` is kept current over the live channel — when an admin renames the workspace or changes its plan, the signals update without a reload.

## Selecting a tenant after login

When a user has more than one **enabled** membership in an **active** tenant, `<bridge-login-form>` surfaces a `<bridge-tenant-selector>` step automatically so they pick which workspace to enter. You don't wire anything — it appears when `AuthService.authState()` becomes `'tenant-selection'`. See [Auth states](/auth/user-token/auth-states/) for the full list of states.

Both conditions matter: a membership that's been disabled, or a tenant that isn't active (for example, suspended for non-payment), doesn't count and won't show up as an option — even though the underlying tenant-user record still exists. A user with memberships in three tenants but only one enabled-and-active goes straight in, no selector shown.

## Switching tenants

A drop-in `<bridge-workspace-selector>` component lists the workspaces the signed-in user can access and switches the active one — the same enabled-and-active filter from tenant selection at login applies here too. On switch, the SDK re-issues a session for the chosen tenant and the whole `BridgeService` surface re-snapshots — including that person's role, which may not be the same in the new tenant as it was in the last one.

**Inputs / Outputs:**

| Name | Type | Description |
|------|------|-------------|
| `className` | `string` | Class applied to the root element |
| `style` | `string` | Inline style applied to the root element |
| `(switched)` | `EventEmitter<void>` | Emitted after the active workspace changes |
| `(error)` | `EventEmitter<Error>` | Emitted on switch error |

**Usage:**

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceSelectorComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-workspace-switcher',
  standalone: true,
  imports: [WorkspaceSelectorComponent],
  template: `
    <bridge-workspace-selector
      (switched)="onSwitched()"
      (error)="onError($event)"
    />
  `,
})
export class WorkspaceSwitcherComponent {
  private readonly router = inject(Router);

  onSwitched(): void {
    this.router.navigateByUrl('/');
  }

  onError(err: Error): void {
    console.error(err);
  }
}
```

## Isolation

Tenant isolation is enforced **server-side**, not in the client:

- Every SDK request carries the active workspace's session; the backend authorizes against that tenant only. A token minted for workspace A can never read workspace B's data.
- Switching workspace mints a fresh session for the target tenant — the client never "merges" data across tenants.
- Feature-flag evaluation, quotas, and entitlements are all scoped to the active tenant, so the same flag key can resolve differently per workspace.

## Under the hood

- **Re-snapshot on switch** — switching workspace replaces the entire session snapshot (user role in that tenant, subscription, entitlements, branding) in one push; every `BridgeService` signal updates together with no half-applied state.
- **Live tenant updates** — `tenant.updated` events keep `bridge.tenant.*` current while you stay in a workspace.
- **One source of identity** — `bridge.user()` is the person; `bridge.tenant` is the workspace they're currently acting in. The pair is what every authorization decision is made against.
