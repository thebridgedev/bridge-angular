/**
 * TBP-744 — `<bridge-upgrade-dialog>`: the dialog that explains a plan limit or
 * a missing plan feature. Angular port of bridge-svelte's
 * `BridgeUpgradeDialog.svelte` (TBP-703 / TBP-756).
 *
 * `provideBridge()` mounts it (see `UpgradeDialogMounter`); the app writes
 * nothing. It opens when:
 *   - the app's backend refuses a request with `402 QUOTA_EXCEEDED`
 *     (bridge-nestjs `@RequireQuota`) — seen by `bridgeInterceptor` / `bridgeFetch`;
 *   - a backend refuses with `402 FEATURE_NOT_IN_PLAN`;
 *   - someone reaches a route whose flag is off because of the plan;
 *   - someone clicks a `<bridge-feature-flag upgrade>` prompt.
 * A page that only renders a hidden feature opens nothing.
 *
 * It names the metric and the numbers and links to the refusal's `fix` path or
 * `billing.manageRoute` (default `/subscription`). A member who cannot manage
 * billing is told to ask the workspace owner, with no Upgrade link.
 *
 * `billing.upgradeDialog: false` turns it off; a component there replaces it
 * and receives the same inputs ({@link BridgeUpgradeDialogInputs}).
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  ViewChild,
} from '@angular/core';
import type { Plan } from '@nebulr-group/bridge-auth-core';
import type { BridgeQuotaRefusal } from '../../billing/quota-refusal';

/** The member-facing sentence for a refused request. */
export const CONTACT_WORKSPACE_OWNER = 'Contact your workspace owner.';

/**
 * The names of the plans that include `feature`, cheapest first. Empty when
 * there is no feature, no plan list, or no plan lists it.
 */
export function plansIncludingFeature(
  plans: ReadonlyArray<Plan> | null | undefined,
  feature: string | null | undefined,
): string[] {
  if (!feature || !plans) return [];
  type WithFeatures = Plan & { features?: ReadonlyArray<{ key: string }> };
  const cheapest = (p: Plan): number => {
    const amounts = (p.prices ?? []).map((price) => price.amount);
    return amounts.length > 0 ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
  };
  return (plans as ReadonlyArray<WithFeatures>)
    .filter((p) => (p.features ?? []).some((f) => f.key === feature))
    .sort((a, b) => cheapest(a) - cheapest(b))
    .map((p) => p.name);
}

@Component({
  selector: 'bridge-upgrade-dialog',
  standalone: true,
  template: `
    <dialog
      #dialogEl
      class="bridge-team-dialog bridge-upgrade-dialog"
      data-bridge-upgrade-dialog
      [attr.data-metric]="refusal?.metric ?? null"
      [attr.data-variant]="featureVariant ? 'feature' : refusal ? 'limit' : null"
      [attr.data-feature]="featureVariant ? feature : null"
      aria-labelledby="bridge-upgrade-dialog-title"
      (close)="onNativeClose()"
    >
      @if (featureVariant) {
        <div class="bridge-team-dialog-content">
          <h3 id="bridge-upgrade-dialog-title" class="bridge-team-dialog-title">This feature isn't on your plan</h3>
          <p
            class="bridge-team-dialog-message"
            data-bridge-upgrade-dialog-message
            [attr.data-variant]="canUpgrade ? 'admin' : 'member'"
          >
            @if (canUpgrade) {
              Upgrade the plan to use it.
            } @else {
              Ask the workspace owner to upgrade the plan to use it.
            }
          </p>
          @if (includedIn.length > 0) {
            <p class="bridge-team-dialog-message" data-bridge-upgrade-dialog-included-in>
              Included in: {{ includedIn.join(', ') }}
            </p>
          }
          <ng-container *ngTemplateOutlet="actions"></ng-container>
        </div>
      } @else if (refusal) {
        <div class="bridge-team-dialog-content">
          <h3 id="bridge-upgrade-dialog-title" class="bridge-team-dialog-title">You've reached your plan's limit</h3>
          <p
            class="bridge-team-dialog-message"
            data-bridge-upgrade-dialog-message
            [attr.data-variant]="canUpgrade ? 'admin' : 'member'"
          >
            @if (!canUpgrade) {
              Your workspace is over its {{ refusal.metric }} cap. {{ contactOwner }}
            } @else if (hasNumbers) {
              This workspace has used <strong>{{ refusal.used!.toLocaleString() }}</strong> of
              <strong>{{ refusal.limit!.toLocaleString() }}</strong>
              <strong data-bridge-upgrade-dialog-metric>{{ refusal.metric }}</strong> on its current plan.
              Upgrade the plan to keep going.
            } @else {
              This workspace has reached its
              <strong data-bridge-upgrade-dialog-metric>{{ refusal.metric }}</strong> limit.
              Upgrade the plan to keep going.
            }
          </p>
          <ng-container *ngTemplateOutlet="actions"></ng-container>
        </div>
      }
    </dialog>

    <ng-template #actions>
      <div class="bridge-team-dialog-actions">
        @if (canUpgrade) {
          <button type="button" class="bridge-btn bridge-btn-secondary" (click)="close()">Not now</button>
          <a class="bridge-btn bridge-btn-primary" [attr.href]="upgradeHref" data-bridge-upgrade-dialog-cta (click)="close()">
            Upgrade plan
          </a>
        } @else {
          <button type="button" class="bridge-btn bridge-btn-primary" (click)="close()">OK</button>
        }
      </div>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class BridgeUpgradeDialogComponent implements OnChanges, AfterViewInit {
  /** The plan-limit refusal to explain, or null. */
  @Input() refusal: BridgeQuotaRefusal | null = null;
  /** With no refusal: the feature (or flag) the plan does not include. */
  @Input() feature: string | null = null;
  /** Where the Upgrade button goes. */
  @Input() upgradeHref = '/subscription';
  /** True when the signed-in user may manage billing. */
  @Input() canUpgrade = false;
  /** The plan catalogue, for "Included in". */
  @Input() plans: ReadonlyArray<Plan> | null = null;
  /** Called to close the dialog. */
  @Input() onclose: () => void = () => {};

  @ViewChild('dialogEl') private dialogEl?: ElementRef<HTMLDialogElement>;

  protected readonly contactOwner = CONTACT_WORKSPACE_OWNER;

  protected get featureVariant(): boolean {
    return !this.refusal && this.feature != null;
  }

  protected get isOpen(): boolean {
    return !!this.refusal || this.featureVariant;
  }

  protected get hasNumbers(): boolean {
    return this.refusal?.used != null && this.refusal?.limit != null;
  }

  protected get includedIn(): string[] {
    return plansIncludingFeature(this.plans, this.feature);
  }

  ngOnChanges(): void {
    this.sync();
  }

  ngAfterViewInit(): void {
    this.sync();
  }

  protected close(): void {
    this.onclose();
  }

  protected onNativeClose(): void {
    // Escape closes the native dialog; tell the owner so the state clears.
    if (this.isOpen) this.onclose();
  }

  private sync(): void {
    const el = this.dialogEl?.nativeElement;
    if (!el) return;
    if (this.isOpen && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!this.isOpen && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }
}
