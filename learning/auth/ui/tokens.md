# Tokens

A drop-in component for managing API tokens. Renders a complete token management UI.

**Usage:**

```typescript
// src/app/pages/settings/api-tokens.component.ts
import { Component } from '@angular/core';
import { ApiTokenManagementComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-api-tokens',
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

No additional inputs are required. `className` and `style` inputs are forwarded to the root element.

> **Tip:** the full token value is displayed exactly once, right after creation. Bridge stores only a hash, so it can never show the secret again; tell your users to copy it into a secret manager before dismissing the dialog, and to revoke and reissue if it's lost.

For what API tokens are and how scoping and revocation work, see [API tokens](/auth/api-tokens/).
