/**
 * Billing 2.0 / US-2 (TBP-248) — Angular port of bridge-svelte's
 * `BridgeSubscriptionStatus.svelte`.
 *
 * Drop-in component that renders the workspace's current canonical plan name +
 * subscription status. Reads auth-core's billing `useBridge().subscription`
 * surface via a signal (§5.1: svelte `$state(snapshot())` + `onMount(subscribe)`
 * → `createSubscriptionSignal()` + `effect`/teardown). Fetches once on mount via
 * `subscription.mount({ apiBaseUrl, accessToken, appId })`.
 */
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { useBridge, type BillingSubscriptionSnapshot } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import {
  createSubscriptionSignal,
  type BillingSignal,
} from '../../core/billing-signals';

@Component({
  selector: 'bridge-subscription-status',
  standalone: true,
  template: `
    <span class="bridge-subscription-status {{ className }}">
      @if (snapshot().loading) {
        <span class="bss-loading">Loading…</span>
      } @else if (snapshot().error) {
        <span class="bss-error">Subscription unavailable</span>
      } @else if (snapshot().state) {
        <span class="bss-plan">{{ snapshot().state?.plan?.name }}</span>
        <span class="bss-badge bss-badge-{{ snapshot().state?.status }}">
          {{ snapshot().state?.status }}
        </span>
      } @else {
        <span class="bss-empty">No subscription</span>
      }
    </span>
  `,
})
export class SubscriptionStatusComponent implements OnInit, OnDestroy {
  /** Optional class applied to the root span. */
  @Input() className = '';

  private _sub?: BillingSignal<BillingSubscriptionSnapshot>;
  private readonly _fallback = signal<BillingSubscriptionSnapshot>({
    state: null,
    loading: false,
    error: null,
  });
  protected readonly snapshot = computed<BillingSubscriptionSnapshot>(() =>
    this._sub ? this._sub.value() : this._fallback(),
  );

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this._sub = createSubscriptionSignal();
    const subscription = useBridge().subscription;
    const ctx = this.authService.getBridgeAuth().getApiContext();
    if (!ctx.accessToken) {
      subscription.setError('Not authenticated');
      return;
    }
    void subscription.mount({
      apiBaseUrl: ctx.apiBaseUrl,
      accessToken: ctx.accessToken,
      appId: ctx.appId,
    });
  }

  ngOnDestroy(): void {
    this._sub?.destroy();
  }
}
