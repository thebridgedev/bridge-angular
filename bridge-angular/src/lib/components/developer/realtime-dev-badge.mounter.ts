/**
 * TBP-644 — mounts `<bridge-realtime-dev-badge>` into `document.body` so every
 * app using `provideBridge()` gets it without template changes. Angular has
 * no provider component to render it from (bridge-react/nextjs mount it from
 * `<BridgeProvider>`, svelte from `<BridgeBootstrap />`), so `provideBridge()`
 * registers `mount()` as an `APP_BOOTSTRAP_LISTENER` — it runs once the root
 * component exists.
 *
 * Development mode only (`isDevMode()`), browser only, and skipped entirely
 * with `devBadge: false`.
 */
import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  PLATFORM_ID,
  createComponent,
  inject,
  isDevMode,
  type ComponentRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { RealtimeDevBadgeComponent } from './realtime-dev-badge.component';

@Injectable({ providedIn: 'root' })
export class RealtimeDevBadgeMounter {
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly configService = inject(BridgeConfigService);
  private readonly platformId = inject(PLATFORM_ID);
  private ref: ComponentRef<RealtimeDevBadgeComponent> | undefined;

  /** Mount the badge. Idempotent; a no-op in production, on the server, or when opted out. */
  mount(): void {
    if (this.ref || !isDevMode() || !isPlatformBrowser(this.platformId)) return;
    if (typeof document === 'undefined') return;
    let enabled = true;
    try {
      enabled = this.configService.getConfig().devBadge !== false;
    } catch {
      // Config not initialised — nothing to opt out with; default applies.
    }
    if (!enabled) return;

    this.ref = createComponent(RealtimeDevBadgeComponent, {
      environmentInjector: this.environmentInjector,
    });
    this.appRef.attachView(this.ref.hostView);
    document.body.appendChild(this.ref.location.nativeElement);
  }

  /** Remove the badge. Idempotent. */
  unmount(): void {
    if (!this.ref) return;
    const el = this.ref.location.nativeElement as HTMLElement;
    this.appRef.detachView(this.ref.hostView);
    this.ref.destroy();
    el.remove();
    this.ref = undefined;
  }
}
