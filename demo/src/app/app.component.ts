import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BridgeService } from '@nebulr-group/bridge-angular';
import { NavbarComponent } from './components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar />
    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  constructor(private bridge: BridgeService) {
    // Expose a `window.bridge`-equivalent for Playwright E2E so specs can read
    // the unified surface (mirrors bridge-svelte's demo `window.bridge`).
    // Signals are exposed as `{ subscribe }`-shaped adapters so the existing
    // svelte spec probe (which calls `.subscribe(fn)()`) works unchanged.
    if (typeof window !== 'undefined') {
      const b = this.bridge;
      const toStore = <T>(read: () => T) => ({
        subscribe(fn: (v: T) => void) {
          fn(read());
          return () => {};
        },
        get value() {
          return read();
        },
      });
      (window as unknown as { bridge: unknown }).bridge = {
        app: {
          branding: toStore(() => b.app.branding()),
          plans: b.app.plans,
        },
        tenant: {
          id: toStore(() => b.tenant.id()),
          name: toStore(() => b.tenant.name()),
          subscription: toStore(() => b.tenant.subscription()),
          entitlements: {
            snapshot: toStore(() => b.tenant.entitlements.snapshot()),
            can: (k: string) => b.tenant.entitlements.can(k),
          },
        },
        user: toStore(() => b.user()),
        attributes: b.attributes,
        events: b.events,
        flag: <T>(key: string, def: T, ctx?: unknown) => b.evaluate(key, def, ctx as never),
      };
    }
  }
}
