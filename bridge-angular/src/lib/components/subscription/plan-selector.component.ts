/**
 * Billing 2.0 — Angular port of bridge-svelte's `PlanSelector.svelte`.
 *
 * Renders the plan catalog and drives plan selection via auth-core's
 * `getBridgeAuth().selectFreePlan / changePlan / startCheckout`. Reads the
 * Stripe-direct subscription slice (`AuthService.subscription` +
 * `loadSubscription()`) — the same source `<bridge-paywall>` uses, so the gate
 * and the picker stay in lockstep.
 *
 * Reactive translation (§5.1): svelte `$state` + `$derived` → signals +
 * `computed`; `onMount(loadSubscription)` → `ngOnInit`.
 *
 * Checkout return: rather than pointing Stripe at in-app success/cancel pages,
 * the selector builds absolute return URLs that route through the OAuth-callback
 * handler (`/auth/oauth-callback`) carrying `stripe_success` / `stripe_cancel`
 * markers. The callback confirms the session with bridge-api, refreshes tokens,
 * reloads the subscription, then redirects to the caller's `successRedirect` /
 * `cancelRedirect`. Mirrors bridge-svelte's BridgeBootstrap and bridge-react's
 * CallbackHandler.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  TemplateRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { Router } from '@angular/router';
import { BridgeConfigService } from '../../config/bridge-config.service';
import { AuthService } from '../../shared/services/auth.service';

/**
 * Context passed to a custom `planCardTemplate`. Mirrors the data the
 * bridge-svelte `planCard` snippet receives:
 * `{ plan, prices, isCurrent, onPick }`. Exposed on `$implicit` so consumers can
 * write `<ng-template let-ctx>` or destructure via `let-plan="plan"` etc.
 */
export interface PlanCardTemplateContext {
  $implicit: {
    plan: Plan;
    prices: PriceOfferSdk[];
    isCurrent: boolean;
    interval: BillingInterval;
    onPick: (price: PriceOfferSdk) => void;
  };
  plan: Plan;
  /** The plan's full price list. */
  prices: PriceOfferSdk[];
  isCurrent: boolean;
  /** TBP-744 — the billing interval tab that is selected (svelte's `interval`). */
  interval: BillingInterval;
  onPick: (price: PriceOfferSdk) => void;
}

/** A billing interval, as the interval tabs offer it. */
export type BillingInterval = PriceOfferSdk['recurrenceInterval'];

/**
 * TBP-744 — context of `planDescriptionTemplate` / `planFooterTemplate`
 * (svelte's `planDescription` / `planFooter` snippets): customise part of the
 * default card without re-implementing it.
 */
export interface PlanPartTemplateContext {
  $implicit: { plan: Plan; isCurrent: boolean };
  plan: Plan;
  isCurrent: boolean;
}

const INTERVAL_ORDER: BillingInterval[] = ['day', 'week', 'month', 'year'];
const INTERVAL_LABELS: Record<BillingInterval, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

/** Paid intervals offered by any plan, in display order. */
export function availableIntervals(plans: readonly Plan[] | null | undefined): BillingInterval[] {
  return INTERVAL_ORDER.filter((i) =>
    (plans ?? []).some((plan) => plan.prices.some((p) => p.amount > 0 && p.recurrenceInterval === i)),
  );
}

/**
 * The prices a plan shows under the selected tab — at most one per interval
 * match, falling back to a free price from any interval, so a free plan stays
 * selectable under every tab without rendering two "Select free plan" buttons.
 */
export function pricesForInterval(plan: Plan, interval: BillingInterval): PriceOfferSdk[] {
  const exact = plan.prices.filter((p) => p.recurrenceInterval === interval);
  if (exact.length > 0) return exact;
  const free = plan.prices.find((p) => p.amount === 0);
  return free ? [free] : [];
}

function minAmount(plan: Plan): number {
  const amounts = (plan.prices ?? []).map((p) => p.amount);
  return amounts.length > 0 ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

/** Cheapest first, by each plan's cheapest price across all intervals (stable across tabs). */
export function sortPlans(plans: readonly Plan[] | null | undefined): Plan[] {
  return [...(plans ?? [])].sort((a, b) => minAmount(a) - minAmount(b));
}

/** The features a plan includes — the same list the upgrade dialog reads. */
export function planFeatures(plan: Plan): ReadonlyArray<{ key: string; name: string }> {
  return (plan as Plan & { features?: ReadonlyArray<{ key: string; name: string }> }).features ?? [];
}

type UiState =
  | 'idle'
  | 'payment-failed'
  | 'setup-payments'
  | 'select-plan'
  | 'active'
  | 'trial';

@Component({
  selector: 'bridge-plan-selector',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div
      [class]="className"
      [style]="style"
      data-bridge-plan-selector
      [attr.data-loading]="loading() || picking()"
      [attr.data-state]="uiState()"
    >
      @if (loading()) {
        @if (loadingStateTemplate) {
          <ng-container [ngTemplateOutlet]="loadingStateTemplate"></ng-container>
        } @else {
          <div class="bridge-plan-loading">
            <span class="bridge-spinner" aria-label="Loading"></span>
          </div>
        }
      } @else if (storeError()) {
        <div class="bridge-alert bridge-alert-error" role="alert">{{ storeError() }}</div>
      } @else {
        @if (pickError()) {
          <div class="bridge-alert bridge-alert-error" role="alert">{{ pickError() }}</div>
        }

        @if (uiState() === 'payment-failed') {
          <div data-bridge-plan-payment-failed class="bridge-plan-payment-failed">
            <div class="bridge-alert bridge-alert-error" role="alert">
              Your last payment failed. Please update your payment method to continue.
            </div>
            <button
              type="button"
              class="bridge-btn-primary bridge-plan-portal-btn"
              (click)="onManageBilling()"
            >
              Manage billing
            </button>
          </div>
        }

        @if (plans() && plans()!.length === 0) {
          @if (emptyStateTemplate) {
            <ng-container [ngTemplateOutlet]="emptyStateTemplate"></ng-container>
          } @else {
            <p class="bridge-plan-empty">No plans available.</p>
          }
        } @else if (plans()) {
          @if (intervals().length >= 2) {
            <div class="bridge-plan-interval-tabs" data-bridge-plan-interval-tabs role="group" aria-label="Billing interval">
              @for (interval of intervals(); track interval) {
                <button
                  type="button"
                  class="bridge-plan-interval-tab"
                  [attr.data-active]="interval === selectedInterval()"
                  [attr.aria-pressed]="interval === selectedInterval()"
                  (click)="intervalOverride.set(interval)"
                >
                  {{ intervalLabel(interval) }}
                </button>
              }
            </div>
          }
          <div class="bridge-plan-cards" data-bridge-plan-cards>
            @for (plan of sortedPlans(); track plan.key) {
              @if (planCardTemplate) {
                <ng-container
                  [ngTemplateOutlet]="planCardTemplate"
                  [ngTemplateOutletContext]="planCardContext(plan)"
                ></ng-container>
              } @else {
              <div
                data-bridge-plan-card
                [attr.data-current]="plan.key === currentPlanKey()"
                [attr.data-trial]="plan.trial"
                class="bridge-plan-card"
              >
                <div class="bridge-plan-card-header">
                  <h3 class="bridge-plan-name">{{ plan.name }}</h3>
                  @if (plan.trial && (plan.trialDays ?? 0) > 0) {
                    <span class="bridge-plan-trial-badge">{{ plan.trialDays }}-day trial</span>
                  }
                </div>

                @if (planDescriptionTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="planDescriptionTemplate"
                    [ngTemplateOutletContext]="partContext(plan)"
                  ></ng-container>
                } @else if (plan.description) {
                  <p class="bridge-plan-description">{{ plan.description }}</p>
                }

                @if (features(plan).length > 0) {
                  <ul class="bridge-plan-features" data-bridge-plan-features [attr.aria-label]="'Included in ' + plan.name">
                    @for (feature of features(plan); track feature.key) {
                      <li class="bridge-plan-feature" [attr.data-feature]="feature.key">{{ feature.name }}</li>
                    }
                  </ul>
                }

                <div class="bridge-plan-prices">
                  @for (price of visiblePrices(plan); track price.recurrenceInterval + price.currency) {
                    <button
                      type="button"
                      class="bridge-btn-primary bridge-plan-select-btn"
                      [disabled]="plan.key === currentPlanKey() || picking()"
                      (click)="handlePick(plan, price)"
                    >
                      @if (plan.key === currentPlanKey()) {
                        Current plan
                      } @else if (price.amount === 0) {
                        Select free plan
                      } @else {
                        {{ price.amount }} {{ price.currency.toUpperCase() }} / {{ price.recurrenceInterval }}
                      }
                    </button>
                  }

                  @if (plan.prices.length === 0) {
                    <button
                      type="button"
                      class="bridge-btn-primary bridge-plan-select-btn"
                      [disabled]="plan.key === currentPlanKey() || picking()"
                      (click)="selectFree(plan)"
                    >
                      {{ plan.key === currentPlanKey() ? 'Current plan' : 'Select plan' }}
                    </button>
                  }
                </div>

                @if (planFooterTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="planFooterTemplate"
                    [ngTemplateOutletContext]="partContext(plan)"
                  ></ng-container>
                }
              </div>
              }
            }
          </div>
        }
      }
    </div>
  `,
})
export class PlanSelectorComponent implements OnInit {
  /** Where to send the user after a successful Stripe payment. @default '/subscription' */
  @Input() successRedirect = '/subscription';
  /** Where to send the user if they cancel Stripe Checkout. @default '/subscription' */
  @Input() cancelRedirect = '/subscription';
  @Input() className = '';
  @Input() style = '';
  /** Emitted after a free-plan or direct plan change (not the Stripe redirect path). */
  @Output() select = new EventEmitter<{ plan: Plan; price: PriceOfferSdk }>();

  /**
   * Optional custom plan-card template (parity with bridge-svelte's `planCard`
   * snippet). Rendered once per plan in place of the default card. Context is
   * exposed on `$implicit` (and as named keys) as
   * `{ plan, prices, isCurrent, onPick }` — call `onPick(price)` to trigger the
   * same checkout/select flow the default card's buttons use. When omitted, the
   * default card renders (backward compatible).
   */
  @Input() planCardTemplate?: TemplateRef<PlanCardTemplateContext>;
  /**
   * TBP-744 — replaces the default card's description paragraph (svelte's
   * `planDescription` snippet). Context: `{ plan, isCurrent }`.
   */
  @Input() planDescriptionTemplate?: TemplateRef<PlanPartTemplateContext>;
  /**
   * TBP-744 — rendered at the bottom of the default card, after the price
   * buttons (svelte's `planFooter` snippet). Context: `{ plan, isCurrent }`.
   */
  @Input() planFooterTemplate?: TemplateRef<PlanPartTemplateContext>;
  /**
   * Which billing interval tab is selected by default. Falls back to the first
   * offered interval when no plan has this one. @default 'year'
   */
  @Input() set defaultInterval(value: BillingInterval) {
    this._defaultInterval.set(value);
  }
  /**
   * Optional custom empty-state template (parity with svelte's `emptyState`
   * snippet). Rendered when the plan list is empty. No context. Falls back to
   * the default "No plans available." message.
   */
  @Input() emptyStateTemplate?: TemplateRef<unknown>;
  /**
   * Optional custom loading template (parity with svelte's `loadingState`
   * snippet). Rendered while the subscription slice is loading. No context.
   * Falls back to the default spinner.
   */
  @Input() loadingStateTemplate?: TemplateRef<unknown>;

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router, { optional: true });
  private readonly configService = inject(BridgeConfigService, { optional: true });

  private readonly _defaultInterval = signal<BillingInterval>('year');
  /** The interval the person picked (null until they pick one). */
  protected readonly intervalOverride = signal<BillingInterval | null>(null);

  protected readonly picking = signal(false);
  protected readonly pickError = signal<string | null>(null);

  private readonly subscription = this.authService.subscription;
  protected readonly status = computed(() => this.subscription().status);
  protected readonly plans = computed(() => this.subscription().plans);
  protected readonly loading = computed(() => this.subscription().loading);
  protected readonly storeError = computed(() => this.subscription().error);

  protected readonly sortedPlans = computed(() => sortPlans(this.plans()));
  protected readonly intervals = computed(() => availableIntervals(this.plans()));
  protected readonly selectedInterval = computed<BillingInterval>(() => {
    const offered = this.intervals();
    const picked = this.intervalOverride();
    if (picked && offered.includes(picked)) return picked;
    const preferred = this._defaultInterval();
    return offered.includes(preferred) ? preferred : (offered[0] ?? preferred);
  });

  protected intervalLabel(interval: BillingInterval): string {
    return INTERVAL_LABELS[interval] ?? interval;
  }

  protected visiblePrices(plan: Plan): PriceOfferSdk[] {
    return pricesForInterval(plan, this.selectedInterval());
  }

  protected features(plan: Plan): ReadonlyArray<{ key: string; name: string }> {
    return planFeatures(plan);
  }

  protected partContext(plan: Plan): PlanPartTemplateContext {
    const isCurrent = plan.key === this.currentPlanKey();
    return { $implicit: { plan, isCurrent }, plan, isCurrent };
  }

  protected readonly uiState = computed<UiState>(() => {
    const status = this.status();
    if (!status) return 'idle';
    if (status.paymentFailed) return 'payment-failed';
    if (status.shouldSetupPayments) return 'setup-payments';
    if (status.shouldSelectPlan) return 'select-plan';
    if (status.trial) return 'trial';
    if (status.paymentsEnabled || status.plan) return 'active';
    return 'select-plan';
  });

  protected readonly currentPlanKey = computed<string | null>(() => {
    const planField = this.status()?.plan as { key: string } | string | undefined;
    return typeof planField === 'string' ? planField : planField?.key ?? null;
  });

  ngOnInit(): void {
    if (!this.status() && !this.loading()) {
      void this.authService.loadSubscription();
    }
  }

  /**
   * Builds the `ngTemplateOutletContext` for a custom `planCardTemplate`. Carries
   * the same data the bridge-svelte `planCard` snippet received. `onPick` is a
   * per-plan closure over `handlePick` so a custom card can trigger checkout /
   * plan selection exactly like the default card's buttons.
   */
  protected planCardContext(plan: Plan): PlanCardTemplateContext {
    const isCurrent = plan.key === this.currentPlanKey();
    const interval = this.selectedInterval();
    const onPick = (price: PriceOfferSdk) => this.handlePick(plan, price);
    return {
      $implicit: { plan, prices: plan.prices, isCurrent, interval, onPick },
      plan,
      prices: plan.prices,
      isCurrent,
      interval,
      onPick,
    };
  }

  async handlePick(plan: Plan, price: PriceOfferSdk): Promise<void> {
    this.picking.set(true);
    this.pickError.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      if (price.amount === 0 && !(plan as Plan & { hasCost?: boolean }).hasCost) {
        await bridge.selectFreePlan(plan.key);
        await this.authService.loadSubscription();
        this.settle(plan, price);
      } else if (this.status()?.paymentsEnabled) {
        await bridge.changePlan(plan.key, price);
        await this.authService.loadSubscription();
        this.select.emit({ plan, price });
      } else {
        // Route Stripe's return through the OAuth callback so it can confirm the
        // session, refresh tokens, and reload the subscription before landing on
        // the caller's redirect. `{CHECKOUT_SESSION_ID}` is Stripe's own template
        // token — it must reach Stripe un-encoded.
        const base = this.callbackBase();
        const successUrl = `${base}?stripe_success=1&session_id={CHECKOUT_SESSION_ID}&redirect=${encodeURIComponent(this.successRedirect)}`;
        const cancelUrl = `${base}?stripe_cancel=1&redirect=${encodeURIComponent(this.cancelRedirect)}`;
        const session = await bridge.startCheckout(plan.key, price, {
          successUrl,
          cancelUrl,
        });
        if (!session.sessionId) {
          // Stripe not configured — plan was set directly on the backend
          await this.authService.loadSubscription();
          this.settle(plan, price);
        } else {
          // Redirect to the Stripe-hosted Checkout URL returned by auth-core.
          // (Stripe.js removed `redirectToCheckout({ sessionId })` on
          // 2025-09-30 — use the checkout URL directly, mirroring bridge-svelte.)
          if (!session.checkoutUrl) throw new Error('Checkout session URL missing');
          window.location.href = session.checkoutUrl;
        }
      }
    } catch (err) {
      this.pickError.set(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      this.picking.set(false);
    }
  }

  /**
   * TBP-744 (svelte TBP-762) — after a pick that changed the plan here, go on
   * the way a paid checkout does: to `successRedirect`, unless the page took
   * over by listening to `(select)`.
   */
  private settle(plan: Plan, price: PriceOfferSdk): void {
    if (this.select.observed) {
      this.select.emit({ plan, price });
      return;
    }
    void this.router?.navigateByUrl(this.successRedirect);
  }

  /** The OAuth callback URL Stripe returns to: the configured `callbackUrl`. */
  private callbackBase(): string {
    try {
      const configured = this.configService?.getConfig().callbackUrl;
      if (configured) return configured.split('?')[0];
    } catch {
      /* not bootstrapped */
    }
    return `${window.location.origin}/auth/oauth-callback`;
  }

  async selectFree(plan: Plan): Promise<void> {
    try {
      await this.authService.getBridgeAuth().selectFreePlan(plan.key);
      await this.authService.loadSubscription();
    } catch (err) {
      this.pickError.set(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async onManageBilling(): Promise<void> {
    try {
      window.location.href = await this.authService.getBridgeAuth().getBillingPortalUrl();
    } catch (err) {
      this.pickError.set(err instanceof Error ? err.message : 'Failed to open billing portal');
    }
  }
}
