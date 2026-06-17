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
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';

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
  template: `
    <div
      [class]="className"
      [style]="style"
      data-bridge-plan-selector
      [attr.data-loading]="loading() || picking()"
      [attr.data-state]="uiState()"
    >
      @if (loading()) {
        <div class="bridge-plan-loading">
          <span class="bridge-spinner" aria-label="Loading"></span>
        </div>
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
          <p class="bridge-plan-empty">No plans available.</p>
        } @else if (plans()) {
          <div class="bridge-plan-cards" data-bridge-plan-cards>
            @for (plan of plans(); track plan.key) {
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

                @if (plan.description) {
                  <p class="bridge-plan-description">{{ plan.description }}</p>
                }

                <div class="bridge-plan-prices">
                  @for (price of plan.prices; track price.id) {
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
              </div>
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

  private readonly authService = inject(AuthService);

  protected readonly picking = signal(false);
  protected readonly pickError = signal<string | null>(null);

  private readonly subscription = this.authService.subscription;
  protected readonly status = computed(() => this.subscription().status);
  protected readonly plans = computed(() => this.subscription().plans);
  protected readonly loading = computed(() => this.subscription().loading);
  protected readonly storeError = computed(() => this.subscription().error);

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

  async handlePick(plan: Plan, price: PriceOfferSdk): Promise<void> {
    this.picking.set(true);
    this.pickError.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      if (price.amount === 0) {
        await bridge.selectFreePlan(plan.key);
        await this.authService.loadSubscription();
        this.select.emit({ plan, price });
      } else if (this.status()?.paymentsEnabled) {
        await bridge.changePlan(plan.key, price);
        await this.authService.loadSubscription();
        this.select.emit({ plan, price });
      } else {
        // Route Stripe's return through the OAuth callback so it can confirm the
        // session, refresh tokens, and reload the subscription before landing on
        // the caller's redirect. `{CHECKOUT_SESSION_ID}` is Stripe's own template
        // token — it must reach Stripe un-encoded.
        const base = `${window.location.origin}/auth/oauth-callback`;
        const successUrl = `${base}?stripe_success=1&session_id={CHECKOUT_SESSION_ID}&redirect=${encodeURIComponent(this.successRedirect)}`;
        const cancelUrl = `${base}?stripe_cancel=1&redirect=${encodeURIComponent(this.cancelRedirect)}`;
        const session = await bridge.startCheckout(plan.key, price, {
          successUrl,
          cancelUrl,
        });
        if (!session.sessionId) {
          // Stripe not configured — plan was set directly on the backend
          await this.authService.loadSubscription();
          this.select.emit({ plan, price });
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

  async selectFree(plan: Plan): Promise<void> {
    try {
      await this.authService.getBridgeAuth().selectFreePlan(plan.key);
      await this.authService.loadSubscription();
    } catch (err) {
      this.pickError.set(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  onManageBilling(): void {
    // auth-core doesn't yet expose a billing portal URL — surface the action so
    // consumers can wire their own flow.
    this.pickError.set(
      'Billing portal not yet wired — implement getPortalUrl on auth-core.',
    );
  }
}
