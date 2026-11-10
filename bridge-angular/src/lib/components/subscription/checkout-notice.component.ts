/**
 * TBP-944 — `<bridge-checkout-notice>`: the "You're on Pro now" banner after a
 * checkout. Angular port of bridge-svelte's `<BridgeCheckoutNotice>` (TBP-813).
 *
 * A completed checkout (or a Free pick) lands on `billing.successRoute`, the
 * subscription page by default, which shows this banner itself. To land
 * somewhere else and still say so, put it on that page or in the app shell:
 *
 *   <bridge-checkout-notice />
 *
 * It renders nothing until a checkout has just completed, shows once, and is
 * gone after a reload. `contentTemplate` replaces the text and receives the
 * result, with the plan name when known; for a message of your own anywhere
 * else, read the `checkoutResult` signal.
 *
 * The host is `display: contents`, so an empty notice takes no room (and adds
 * no gap) in a flex or grid layout.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  Input,
  OnDestroy,
  TemplateRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { BillingSubscriptionSnapshot, Plan } from '@nebulr-group/bridge-auth-core';
import {
  checkoutResult,
  clearCheckoutResult,
  type BridgeCheckoutResult,
} from '../../billing/checkout-result';
import { createSubscriptionSignal, type BillingSignal } from '../../core/billing-signals';
import { AuthService } from '../../shared/services/auth.service';

/** What a `contentTemplate` receives: the result, with the plan name when known. */
export interface CheckoutNoticeTemplateContext {
  $implicit: { kind: BridgeCheckoutResult['kind']; planName: string | null };
  kind: BridgeCheckoutResult['kind'];
  planName: string | null;
}

@Component({
  selector: 'bridge-checkout-notice',
  standalone: true,
  imports: [NgTemplateOutlet],
  host: { style: 'display: contents' },
  template: `
    @if (shown(); as result) {
      <div
        class="bridge-checkout-notice {{ className }}"
        data-bridge-checkout-notice
        [attr.data-kind]="result.kind"
        role="status"
      >
        <svg class="bridge-checkout-notice-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.6" />
          <path d="M6 10.2l2.6 2.6L14 7.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="bridge-checkout-notice-body">
          @if (contentTemplate) {
            <ng-container [ngTemplateOutlet]="contentTemplate" [ngTemplateOutletContext]="context()"></ng-container>
          } @else {
            <strong class="bridge-checkout-notice-title">
              {{ planName() ? "You're on " + planName() + ' now' : 'Your new plan is active' }}
            </strong>
            <span class="bridge-checkout-notice-text">
              {{
                result.kind === 'checkout'
                  ? 'Your payment went through and the new plan is active.'
                  : 'The change takes effect right away.'
              }}
            </span>
          }
        </div>
        @if (dismissible) {
          <button type="button" class="bridge-checkout-notice-close" aria-label="Dismiss" (click)="dismiss()">
            ×
          </button>
        }
      </div>
    }
  `,
})
export class CheckoutNoticeComponent implements OnDestroy {
  /** Optional class on the banner. */
  @Input() className = '';
  /** Show a close button. @default true */
  @Input() dismissible = true;
  /** Replaces the banner's text. Context: `{ kind, planName }` (also on `$implicit`). */
  @Input() contentTemplate?: TemplateRef<CheckoutNoticeTemplateContext>;

  private readonly auth = inject(AuthService, { optional: true });

  /** The result this banner took, so it stays after the shared signal is cleared. */
  protected readonly shown = signal<BridgeCheckoutResult | null>(null);

  private readonly billing: BillingSignal<BillingSubscriptionSnapshot> | null = (() => {
    try {
      return createSubscriptionSignal();
    } catch {
      return null; // Bridge not initialised: the banner goes without the plan name
    }
  })();

  protected readonly planName = computed<string | null>(() => {
    const shown = this.shown();
    if (shown?.planName) return shown.planName;
    const fromState = this.billing?.value().state?.plan?.name;
    if (fromState) return fromState;
    const plan = this.auth?.subscription().status?.plan as Plan | string | undefined;
    return plan && typeof plan === 'object' ? (plan.name ?? null) : null;
  });

  protected readonly context = computed<CheckoutNoticeTemplateContext>(() => {
    const kind = this.shown()?.kind ?? 'checkout';
    const planName = this.planName();
    return { $implicit: { kind, planName }, kind, planName };
  });

  constructor() {
    // Take the result as soon as it is set, so it shows once, including on a
    // page that is already open when a Free pick lands back on it. Cleared a
    // microtask later so a second notice rendering in the same pass sees it too.
    effect(() => {
      const value = checkoutResult();
      if (!value) return;
      untracked(() => this.shown.set(value));
      queueMicrotask(clearCheckoutResult);
    });
  }

  protected dismiss(): void {
    this.shown.set(null);
  }

  ngOnDestroy(): void {
    this.billing?.destroy();
  }
}
