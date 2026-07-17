/**
 * Billing 2.0 — Angular port of bridge-svelte's `BridgePaywall.svelte`.
 *
 * Fullscreen plan-selection paywall. Drop into the root layout to gate
 * unsubscribed users. While the subscription status is known and the tenant has
 * no plan selected (and the app hasn't opted out via `paymentsAutoRedirect:
 * false`), it renders a fullscreen modal with `<bridge-plan-selector>`;
 * otherwise it projects its content.
 *
 * Data source mirrors svelte: the Stripe-direct subscription slice
 * (`AuthService.subscription` + `loadSubscription()`), same as PlanSelector, so
 * gate + picker stay in lockstep.
 *
 * Prop names hold the svelte public contract (`successRedirect` /
 * `cancelRedirect`) and pass straight through to `<bridge-plan-selector>`, which
 * builds the absolute Stripe return URL (routing through the OAuth-callback
 * confirm-checkout handler) internally.
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
} from '@angular/core';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { PlanSelectorComponent } from './plan-selector.component';

@Component({
  selector: 'bridge-paywall',
  standalone: true,
  imports: [PlanSelectorComponent, NgTemplateOutlet],
  template: `
    @if (showPaywall()) {
      <div class="bridge-paywall" role="dialog" aria-modal="true" aria-label="Choose a plan">
        <div class="bridge-paywall-panel">
          @if (headingTemplate) {
            <ng-container [ngTemplateOutlet]="headingTemplate"></ng-container>
          } @else if (heading) {
            <h2 class="bridge-paywall-heading">{{ heading }}</h2>
          } @else {
            <h2 class="bridge-paywall-heading">Choose a plan</h2>
          }
          <bridge-plan-selector
            [successRedirect]="successRedirect"
            [cancelRedirect]="cancelRedirect"
            (select)="select.emit($event)"
          />
        </div>
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class PaywallComponent implements OnInit {
  /** Where to send the user after a successful Stripe payment. @default '/' */
  @Input() successRedirect = '/';
  /** Where to send the user if they cancel Stripe Checkout. @default '/' */
  @Input() cancelRedirect = '/';
  /** Override the default "Choose a plan" heading (plain-text). */
  @Input() heading?: string;
  /**
   * Optional custom heading template (parity with bridge-svelte's `heading`
   * snippet). Rendered in place of the default heading. No context. Takes
   * precedence over the plain-text `heading` input; when neither is supplied the
   * default "Choose a plan" heading renders (backward compatible).
   */
  @Input() headingTemplate?: TemplateRef<unknown>;
  /** Called after free-plan or direct plan change (not the Stripe redirect path). */
  @Output() select = new EventEmitter<{ plan: Plan; price: PriceOfferSdk }>();

  private readonly authService = inject(AuthService);
  private readonly subscription = this.authService.subscription;

  protected readonly showPaywall = computed(() => {
    const { status, loading } = this.subscription();
    return (
      !loading &&
      !!status?.shouldSelectPlan &&
      status?.paymentsAutoRedirect !== false
    );
  });

  ngOnInit(): void {
    const { status, loading } = this.subscription();
    if (!status && !loading) {
      void this.authService.loadSubscription();
    }
  }
}
