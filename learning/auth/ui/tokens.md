# Tokens

A drop-in component (`bridge-api-token-management` / `ApiTokenManagementComponent`) for managing API tokens. Renders a complete token management UI.

**Usage:**

```ts
import { Component } from '@angular/core';
import { ApiTokenManagementComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-api-tokens-page',
  standalone: true,
  imports: [ApiTokenManagementComponent],
  template: `<bridge-api-token-management className="my-token-panel" />`,
})
export class ApiTokensPageComponent {}
```

The component provides:
- List of existing API tokens
- Create new tokens with a privilege picker (searchable)
- Revoke tokens with confirmation
- Display a new token value once after creation (show/hide/copy)
- Token expiry date display

**Props:**

| Input | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Forwarded to the root element's `class` |
| `style` | `string` | `''` | Forwarded to the root element's `style` |

No outputs are emitted — success and error messages are rendered as inline banners inside the component itself rather than surfaced via events.
