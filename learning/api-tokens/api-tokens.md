# API Token Management

### `<bridge-api-token-management>`

A drop-in component for managing API tokens. Renders a complete token management UI, backed by auth-core's `ApiTokenService` (via the BridgeAuth singleton).

**Usage:**

```ts
// src/app/pages/api-tokens/api-tokens.component.ts
import { Component } from '@angular/core';
import { ApiTokenManagementComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-api-tokens',
  standalone: true,
  imports: [ApiTokenManagementComponent],
  template: `<bridge-api-token-management className="my-token-panel" />`,
})
export class ApiTokensComponent {}
```

The component provides:
- List of existing API tokens
- Create new tokens with a privilege picker (searchable)
- Revoke tokens with confirmation
- Display a new token value once after creation (show/hide/copy)
- Token expiry date display

**Inputs:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Class applied to the root element |
| `style` | `string` | `''` | Inline style applied to the root element |

The structural CSS ships in `@nebulr-group/bridge-angular/styles.css`; import it once in your root `styles.css`:

```css
@import '@nebulr-group/bridge-angular/styles.css';
```

For custom UIs, call `ApiTokenService` directly via the BridgeAuth singleton:

```ts
import { AuthService } from '@nebulr-group/bridge-angular';

const api = this.authService.getBridgeAuth().apiTokens;
const tokens = await api.listTokens();
const privileges = await api.listAvailablePrivileges();
const { token, record } = await api.createToken({ name: 'CI token', privileges: [] });
await api.revokeToken(record.id);
```

`ApiTokenService` and its types (`ApiToken`, `AvailablePrivilege`, `CreateApiTokenInput`, `CreateApiTokenResponse`) are re-exported from `@nebulr-group/bridge-angular`, so you don't need a direct dependency on `@nebulr-group/bridge-auth-core`.
