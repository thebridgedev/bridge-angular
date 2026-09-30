/**
 * TBP-744 — mounts the upgrade dialog into `document.body` so every app using
 * `provideBridge()` gets it with no template changes (bridge-svelte mounts it
 * from `<BridgeBootstrap>`). Registered as an `APP_BOOTSTRAP_LISTENER`.
 *
 * `billing.upgradeDialog: false` mounts nothing; a component there is mounted
 * instead of `<bridge-upgrade-dialog>` and receives the same inputs.
 */
import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  PLATFORM_ID,
  createComponent,
  effect,
  inject,
  reflectComponentType,
  untracked,
  type ComponentRef,
  type EffectRef,
  type Type,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Plan } from '@nebulr-group/bridge-auth-core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { resolveBillingPaths } from '../../routing/billing-paths';
import {
  dismissFeatureUpgrade,
  dismissQuotaRefusal,
  featureUpgrade,
  quotaRefusal,
  type BridgeFeatureUpgrade,
  type BridgeQuotaRefusal,
} from '../../billing/quota-refusal';
import { AuthService } from '../../shared/services/auth.service';
import type { BridgeConfig, BridgeUpgradeDialogInputs } from '../../types/config';
import { BridgeUpgradeDialogComponent } from './upgrade-dialog.component';

/**
 * The dialog to mount for a `billing` config: the built-in one (`'default'`),
 * the app's own component, or none. Anything that is not `false` and not a
 * component is the built-in default — the dialog is on unless turned off.
 */
export function resolveUpgradeDialog(
  billing: BridgeConfig['billing'] | undefined,
): 'default' | Type<unknown> | null {
  const setting = billing?.upgradeDialog;
  if (setting === false) return null;
  if (typeof setting === 'function') return setting;
  return 'default';
}

/** Where the Upgrade button goes: the refusal's own `fix`, else `billing.manageRoute`. */
export function upgradeHrefFor(
  request: { fix: string | null } | null,
  billing: BridgeConfig['billing'] | undefined,
): string {
  return request?.fix ?? resolveBillingPaths(billing).manageRoute;
}

/** The inputs the dialog gets for the current refusal / feature request. */
export function upgradeDialogInputs(
  refusal: BridgeQuotaRefusal | null,
  feature: BridgeFeatureUpgrade | null,
  billing: BridgeConfig['billing'] | undefined,
  canManageBilling: () => boolean,
  plans: ReadonlyArray<Plan> | null,
): Omit<BridgeUpgradeDialogInputs, 'onclose'> {
  const open = !!(refusal || feature);
  return {
    // A plan-limit refusal wins when both are pending.
    refusal,
    feature: refusal ? null : feature ? (feature.feature ?? feature.flag ?? '') : null,
    upgradeHref: upgradeHrefFor(refusal ?? feature, billing),
    canUpgrade: open ? safe(canManageBilling) : false,
    plans,
  };
}

function safe(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    // No BridgeAuth — the member variant (fails closed).
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class UpgradeDialogMounter {
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly configService = inject(BridgeConfigService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private ref: ComponentRef<unknown> | undefined;
  private watcher: EffectRef | undefined;

  /** Mount the dialog. Idempotent; a no-op on the server or with `upgradeDialog: false`. */
  mount(): void {
    if (this.ref || !isPlatformBrowser(this.platformId) || typeof document === 'undefined') return;
    let billing: BridgeConfig['billing'];
    try {
      billing = this.configService.getConfig().billing;
    } catch {
      billing = undefined;
    }
    const which = resolveUpgradeDialog(billing);
    if (!which) return;
    const component = which === 'default' ? BridgeUpgradeDialogComponent : which;

    const ref = createComponent(component, { environmentInjector: this.environmentInjector });
    this.ref = ref;
    this.appRef.attachView(ref.hostView);
    document.body.appendChild(ref.location.nativeElement);

    // A replacement dialog may declare only the inputs it uses.
    const declared = new Set(
      (reflectComponentType(component)?.inputs ?? []).map((i) => i.templateName),
    );
    const set = (key: string, value: unknown) => {
      if (declared.has(key)) ref.setInput(key, value);
    };
    set('onclose', () => {
      dismissQuotaRefusal();
      dismissFeatureUpgrade();
    });

    this.watcher = effect(
      () => {
        const refusal = quotaRefusal();
        const feature = featureUpgrade();
        const subscription = this.auth.subscription();
        // The feature variant names the plans that include the feature: load
        // the catalogue once when it opens.
        if (feature && !refusal && this.auth.isAuthenticated()) {
          if (!subscription.plans && !subscription.loading && !subscription.error) {
            untracked(() => void this.auth.loadSubscription().catch(() => {}));
          }
        }
        const inputs = upgradeDialogInputs(
          refusal,
          feature,
          billing,
          () => this.auth.getBridgeAuth().canManageBilling(),
          subscription.plans,
        );
        untracked(() => {
          for (const [key, value] of Object.entries(inputs)) set(key, value);
          ref.changeDetectorRef.detectChanges();
        });
      },
      { injector: this.environmentInjector },
    );
  }

  /** Remove the dialog. Idempotent. */
  unmount(): void {
    this.watcher?.destroy();
    this.watcher = undefined;
    if (!this.ref) return;
    const el = this.ref.location.nativeElement as HTMLElement;
    this.appRef.detachView(this.ref.hostView);
    this.ref.destroy();
    el.remove();
    this.ref = undefined;
  }
}
