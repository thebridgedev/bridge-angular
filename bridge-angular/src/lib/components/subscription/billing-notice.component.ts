/**
 * Billing 2.0 / US-5 → US-9 — Angular port of bridge-svelte's
 * `BridgeBillingNotice.svelte`.
 *
 * Unified billing-notice component. Renders the workspace's current billing
 * notice based on auth-core's `useBridge().subscription`. Multi-state:
 * past_due, cancellation, trial, dunning, locked. New states slot in via the
 * notice-state → content map.
 *
 * Reactive translation (§5.1): svelte `$state(snapshot())` + `onMount(subscribe)`
 * → `createSubscriptionSignal()`; `$derived(...)` → `computed`; `{#if}/{:else}`
 * → control flow; `onclick` → `(click)`.
 */
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import {
  deriveNoticeState,
  deriveSeverity,
  useBridge,
  type BillingNoticeState,
  type BillingSubscriptionSnapshot,
  type BillingSubscriptionState,
} from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import {
  createSubscriptionSignal,
  type BillingSignal,
} from '../../core/billing-signals';

type Chassis = 'bar' | 'rail' | 'card';

@Component({
  selector: 'bridge-billing-notice',
  standalone: true,
  template: `
    @if (visible()) {
      @if (asLockscreen()) {
        <div
          class="bridge-billing-lockscreen {{ className }}"
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
        >
          <div class="bbl-panel">
            <strong class="bbl-title">{{ copy().title }}</strong>
            <span class="bbl-body">{{ copy().body }}</span>
            @if (copy().cta && isBillingAdmin()) {
              <button type="button" class="bbl-cta" (click)="handleAction()">
                {{ copy().cta }}
              </button>
            }
          </div>
        </div>
      } @else {
        <div
          class="bridge-billing-notice bbn-chassis-{{ chassis }} bbn-severity-{{ severity() }} {{ className }}"
          [attr.role]="isAssertive() ? 'alert' : 'status'"
          [attr.aria-live]="isAssertive() ? 'assertive' : 'polite'"
        >
          <div class="bbn-content">
            <strong class="bbn-title">{{ copy().title }}</strong>
            <span class="bbn-body">{{ copy().body }}</span>
          </div>
          @if (copy().cta && isBillingAdmin()) {
            <button type="button" class="bbn-cta" (click)="handleAction()">
              {{ copy().cta }}
            </button>
          }
        </div>
      }
    }
  `,
})
export class BillingNoticeComponent implements OnInit, OnDestroy {
  /** Visual chassis variant. */
  @Input() chassis: Chassis = 'rail';
  /** `soft` (default) always renders the inline banner; `hard` renders a
   *  full-screen lockscreen when the workspace is locked. */
  @Input() mode: 'soft' | 'hard' = 'soft';
  /** Optional class applied to the root element. */
  @Input() className = '';
  /** Override the default CTA click handler (links to billing surface). */
  @Input() onActionClick?: (state: BillingNoticeState) => void;

  private _sub?: BillingSignal<BillingSubscriptionSnapshot>;
  private readonly _fallback = signal<BillingSubscriptionSnapshot>({
    state: null,
    loading: false,
    error: null,
  });
  protected readonly snapshot = computed<BillingSubscriptionSnapshot>(() =>
    this._sub ? this._sub.value() : this._fallback(),
  );

  protected readonly isBillingAdmin = signal(false);

  protected readonly noticeState = computed<BillingNoticeState>(() =>
    deriveNoticeState(this.snapshot().state),
  );
  protected readonly severity = computed(() => deriveSeverity(this.noticeState()));
  protected readonly visible = computed(
    () => this.snapshot().state !== null && this.noticeState() !== 'active',
  );
  protected readonly asLockscreen = computed(
    () => this.mode === 'hard' && this.severity() === 'locked',
  );
  protected readonly isAssertive = computed(
    () => this.severity() === 'critical' || this.severity() === 'locked',
  );
  protected readonly copy = computed(() =>
    getCopy(this.noticeState(), this.isBillingAdmin(), this.snapshot().state),
  );

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this._sub = createSubscriptionSignal();
    const subscription = useBridge().subscription;
    const bridge = this.authService.getBridgeAuth();
    const ctx = bridge.getApiContext();
    if (ctx.accessToken) this.isBillingAdmin.set(bridge.canManageBilling());
    if (!ctx.accessToken) {
      subscription.setError('Not authenticated');
      return;
    }
    if (!subscription.snapshot().state) {
      void subscription.mount({
        apiBaseUrl: ctx.apiBaseUrl,
        accessToken: ctx.accessToken,
        appId: ctx.appId,
      });
    }
  }

  ngOnDestroy(): void {
    this._sub?.destroy();
  }

  handleAction(): void {
    if (this.onActionClick) {
      this.onActionClick(this.noticeState());
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/billing';
    }
  }
}

/**
 * Copy map (pure function — ported verbatim from the svelte/react source).
 * Member variant suppresses the CTA.
 */
function getCopy(
  state: BillingNoticeState,
  admin: boolean,
  snap: BillingSubscriptionState | null,
): { title: string; body: string; cta?: string } {
  const cardLast4 = snap?.cardLast4;
  const endsAt = snap?.endsAt;
  const daysLeft = snap?.daysLeft;
  const nextRetryAt = snap?.nextRetryAt;

  switch (state) {
    case 'past_due':
      return admin
        ? {
            title: 'Payment failed',
            body: cardLast4
              ? `We couldn't charge your card ending in ${cardLast4}. Update your payment method to keep using ${snap?.plan.name ?? 'your plan'}.`
              : `We couldn't charge your card. Update your payment method to keep using ${snap?.plan.name ?? 'your plan'}.`,
            cta: 'Update card',
          }
        : {
            title: "Your workspace's payment failed",
            body: 'Please contact your workspace owner to update the payment method.',
          };
    case 'past_due_trial':
      return admin
        ? {
            title: 'Trial ended',
            body: 'Add a payment method to keep using your workspace.',
            cta: 'Add card',
          }
        : {
            title: "Your workspace's trial has ended",
            body: 'Please contact your workspace owner to add a payment method.',
          };
    case 'trial_active':
      return admin
        ? {
            title: 'Trial active',
            body: daysLeft !== undefined ? `${daysLeft} days left in your trial.` : 'Trial in progress.',
          }
        : {
            title: 'Trial active',
            body: daysLeft !== undefined ? `${daysLeft} days left.` : 'Trial in progress.',
          };
    case 'trial_ending_soon':
      return admin
        ? {
            title: 'Trial ending soon',
            body: daysLeft !== undefined ? `${daysLeft} days left. Add a payment method to keep your access.` : 'Add a payment method to keep your access.',
            cta: 'Add card',
          }
        : {
            title: 'Trial ending soon',
            body: daysLeft !== undefined ? `${daysLeft} days left.` : 'Contact your workspace owner.',
          };
    case 'cancel_at_period_end':
      return admin
        ? {
            title: 'Subscription ending',
            body: endsAt
              ? `Your subscription ends ${new Date(endsAt).toLocaleDateString()}. You'll keep full access until then.`
              : "Your subscription is ending. You'll keep access until the period ends.",
            cta: 'Reactivate',
          }
        : {
            title: 'Subscription ending',
            body: endsAt ? `Your workspace's subscription ends ${new Date(endsAt).toLocaleDateString()}.` : "Your workspace's subscription is ending.",
          };
    case 'canceled':
      return admin
        ? { title: 'Subscription canceled', body: 'Your subscription has ended. Choose a plan to continue.', cta: 'Choose plan' }
        : { title: 'Subscription canceled', body: 'Please contact your workspace owner.' };
    case 'dunning_active':
      return admin
        ? {
            title: 'Payment retry scheduled',
            body: nextRetryAt
              ? `We'll retry your payment on ${new Date(nextRetryAt).toLocaleDateString()}. Update your card to avoid interruption.`
              : "We'll retry your payment soon. Update your card to avoid interruption.",
            cta: 'Update card',
          }
        : { title: 'Payment retry scheduled', body: 'Please contact your workspace owner to update the payment method.' };
    case 'dunning_final_retry':
      return admin
        ? {
            title: 'Final payment retry',
            body: 'This is the last automatic retry. Update your card now to avoid losing access.',
            cta: 'Update card',
          }
        : { title: 'Final payment retry', body: 'Please contact your workspace owner immediately.' };
    case 'dunning_exhausted':
      return admin
        ? { title: 'Access locked', body: 'Payment retries have exhausted. Update your card to restore access.', cta: 'Update card' }
        : { title: 'Access locked', body: 'Please contact your workspace owner.' };
    default:
      return { title: '', body: '' };
  }
}
