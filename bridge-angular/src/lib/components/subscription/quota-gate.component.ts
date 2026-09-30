/**
 * TBP-744 — level 1 of plan limits: the action inside is disabled once the
 * workspace is at its plan's hard cap, and an upgrade line shows beside it.
 * Angular port of bridge-svelte's `<QuotaGate>` (TBP-703).
 *
 *   <bridge-quota-gate metric="tickets">
 *     <button (click)="createTicket()">New ticket</button>
 *     <span *bridgeQuotaAtLimit="let quota">
 *       {{ quota.used }} of {{ quota.limit }} tickets used. <a routerLink="/subscription">Upgrade</a>
 *     </span>
 *   </bridge-quota-gate>
 *
 * Or on the control itself: `<button [bridgeQuotaGate]="'tickets'">`.
 *
 * Disabling is done by a `<fieldset disabled>` around the content, so every
 * button, input, select and textarea inside is disabled natively and announced
 * as such. Never disables on "don't know yet": loading, unlimited and metered
 * quotas leave the content enabled. Decoration only — the backend's
 * `@RequireQuota` is what refuses the write.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ContentChild,
  Directive,
  ElementRef,
  Input,
  Renderer2,
  TemplateRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { resolveBillingPaths } from '../../routing/billing-paths';
import { injectQuota, quotaGateState, type QuotaState } from '../../billing/quota-state';

/** Template context of `*bridgeQuotaAtLimit`. */
export interface QuotaAtLimitContext {
  $implicit: QuotaState;
  quota: QuotaState;
}

/** Marks what `<bridge-quota-gate>` shows at the cap, in place of its default line. */
@Directive({ selector: '[bridgeQuotaAtLimit]', standalone: true })
export class BridgeQuotaAtLimitDirective {
  constructor(public templateRef: TemplateRef<QuotaAtLimitContext>) {}

  static ngTemplateContextGuard(_dir: BridgeQuotaAtLimitDirective, ctx: unknown): ctx is QuotaAtLimitContext {
    return true;
  }
}

function manageRouteOf(config: BridgeConfigService | null): string {
  try {
    return resolveBillingPaths(config?.getConfig().billing).manageRoute;
  } catch {
    return resolveBillingPaths(undefined).manageRoute;
  }
}

@Component({
  selector: 'bridge-quota-gate',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div
      class="bridge-quota-gate"
      [class]="className"
      data-bridge-quota-gate
      [attr.data-metric]="metricSignal()"
      [attr.data-state]="gateState()"
    >
      <fieldset [disabled]="blocked()" class="bridge-quota-gate-controls" style="display: contents; border: 0; margin: 0; padding: 0">
        <ng-content></ng-content>
      </fieldset>
      @if (blocked()) {
        <div class="bridge-quota-gate-limit" data-bridge-quota-gate-limit role="status">
          @if (atLimit) {
            <ng-container
              [ngTemplateOutlet]="atLimit.templateRef"
              [ngTemplateOutletContext]="{ $implicit: quota(), quota: quota() }"
            ></ng-container>
          } @else {
            You've used all {{ quota().limit?.toLocaleString() }} {{ metricSignal() }} on your plan.
            <a [attr.href]="manageRoute">Upgrade</a>
          }
        </div>
      }
    </div>
  `,
})
export class QuotaGateComponent {
  protected readonly metricSignal = signal('');

  /** The quota metric key, e.g. `'tickets'`. */
  @Input({ required: true }) set metric(value: string) {
    this.metricSignal.set(value);
  }

  /** Class on the wrapper. */
  @Input() className = '';

  @ContentChild(BridgeQuotaAtLimitDirective) atLimit?: BridgeQuotaAtLimitDirective;

  protected readonly quota = injectQuota(this.metricSignal);
  protected readonly gateState = computed(() => quotaGateState(this.quota()));
  protected readonly blocked = computed(() => this.gateState() === 'at-limit');
  protected readonly manageRoute = manageRouteOf(inject(BridgeConfigService, { optional: true }));
}

/**
 * `[bridgeQuotaGate]="'tickets'"` — the same gate on a single control: the host
 * gets `disabled` at a known hard cap, and `data-bridge-quota-state` always.
 */
@Directive({
  selector: '[bridgeQuotaGate]',
  standalone: true,
})
export class QuotaGateDirective {
  private readonly metricSignal = signal('');

  @Input({ required: true }) set bridgeQuotaGate(value: string) {
    this.metricSignal.set(value);
  }

  private readonly quota = injectQuota(this.metricSignal);
  /** The gate state, for the host's own bindings. */
  readonly state = computed(() => quotaGateState(this.quota()));

  constructor() {
    const el = inject(ElementRef<HTMLElement>);
    const renderer = inject(Renderer2);
    // Only undo a `disabled` this directive set, so an app's own binding wins.
    let disabledByGate = false;
    effect(() => {
      const state = this.state();
      renderer.setAttribute(el.nativeElement, 'data-bridge-quota-state', state);
      if (state === 'at-limit') {
        renderer.setAttribute(el.nativeElement, 'disabled', '');
        disabledByGate = true;
      } else if (disabledByGate) {
        renderer.removeAttribute(el.nativeElement, 'disabled');
        disabledByGate = false;
      }
    });
  }
}
