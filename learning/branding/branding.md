# Branding

Bridge ships a **branding snapshot** for each workspace (called a *tenant* in the API): logo, display name, and colours, exposed on [the `BridgeService`](/live-updates/). It arrives with the `session.snapshot` and is replaced on every `branding.updated` push, so when an admin changes the logo or brand colour your UI reflects it within seconds, without a reload.

This is distinct from the static [Theming](/theming/) guide (which styles the Bridge components with your own CSS): branding is **workspace-supplied, live data** you read and apply yourself.

### Reading the branding snapshot

`bridge.app.branding` is a reactive signal holding the current snapshot (or `null` before it lands):

```typescript
import { Component, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    @if (branding(); as b) {
      <header [style.background]="b.bgColor" [style.color]="b.textColor">
        <img [src]="b.logo" [alt]="b.name" height="28" />
        <span>{{ b.name }}</span>
      </header>
    }
  `,
})
export class AppHeaderComponent {
  protected readonly branding = inject(BridgeService).app.branding;
}
```

### Snapshot fields

| Field | Type | Description |
|-------|------|-------------|
| `logo` | `string` | URL of the workspace logo |
| `name` | `string` | Workspace / brand display name |
| `primaryButtonBgColor` | `string` (optional) | Brand colour for primary actions |
| `textColor` | `string` (optional) | Foreground text colour |
| `bgColor` | `string` (optional) | Surface background colour |
| `fontFamily` | `string` (optional) | Brand font family |

Only `logo` and `name` are always present; guard the four optional fields (or fall back to your own defaults) when you apply them.

### Applying branding as CSS variables

The cleanest way to white-label a whole app is to map the snapshot onto CSS custom properties once, high in the tree, and let the rest of your styles read them. Set the properties on `document.body` from an `effect()` in your root component:

```typescript
import { Component, effect, inject } from '@angular/core';
import { BridgeService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-root',
  /* ... */
})
export class AppComponent {
  private readonly branding = inject(BridgeService).app.branding;

  constructor() {
    effect(() => {
      const b = this.branding();
      const vars: Record<string, string | undefined> = {
        '--brand-primary': b?.primaryButtonBgColor,
        '--brand-fg': b?.textColor,
        '--brand-bg': b?.bgColor,
      };
      for (const [name, value] of Object.entries(vars)) {
        if (value) document.body.style.setProperty(name, value);
        else document.body.style.removeProperty(name);
      }
    });
  }
}
```

### Under the hood

- **Live by default**: the snapshot is delivered on `session.snapshot` and swapped wholesale on each `branding.updated` event over the live channel (a persistent realtime connection the SDK maintains); no polling, no manual refetch.
- **Fail-soft**: `branding` is `null` until the first snapshot lands. Guard your reads (`branding()?.logo`) and fall back to your own defaults so first paint never breaks.
- **Per workspace**: switching workspace (see [Multi-tenancy](/auth/multi-tenancy/)) re-emits the snapshot for the new workspace, so the brand follows the active workspace automatically.
