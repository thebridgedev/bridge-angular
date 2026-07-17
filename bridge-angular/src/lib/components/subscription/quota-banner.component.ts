/**
 * Billing 2.0 / US-11 (TBP-263) — Angular port of bridge-svelte's
 * `BridgeQuotaBanner.svelte`.
 *
 * Live "approaching cap" / "over cap" notice for a single metric. Reads
 * auth-core's `useBridge().quota(metric)` via a signal so initial hydration +
 * live `quota.updated` pushes flow into the UI without consumer wiring.
 *
 * Renders nothing while the metric has no quota configured, or usage is below
 * 80% of the limit (`warningLevel === null`).
 *
 * Reactive translation (§5.1): svelte `$state(quota(metric))` +
 * `onMount(quotas.subscribe)` + `$effect(rehydrate on metric change)` →
 * `createQuotaSignal()` re-created in `ngOnChanges`; `$derived(...)` → `computed`.
 */
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import {
  createQuotaSignal,
  type BillingSignal,
} from '../../core/billing-signals';

type Chassis = 'rail';
type Severity = 'warn' | 'critical';

@Component({
  selector: 'bridge-quota-banner',
  standalone: true,
  template: `
    @if (visible() && snapshot()) {
      <div
        class="bridge-quota-banner bqb-chassis-{{ chassis }} bqb-severity-{{ severity() }} {{ className }}"
        [attr.role]="severity() === 'critical' ? 'alert' : 'status'"
        [attr.aria-live]="severity() === 'critical' ? 'assertive' : 'polite'"
        [attr.aria-label]="displayLabel() + ' quota ' + percent() + '% used'"
      >
        <div class="bqb-content">
          <strong class="bqb-title">{{ copy().title }}</strong>
          <span class="bqb-body">{{ copy().body }}</span>
          <div class="bqb-meter" aria-hidden="true">
            <div class="bqb-meter-fill" [style.width.%]="percent()"></div>
          </div>
        </div>
        @if (copy().cta && isBillingAdmin()) {
          <button type="button" class="bqb-cta" (click)="handleAction()">
            {{ copy().cta }}
          </button>
        }
      </div>
    }
  `,
})
export class QuotaBannerComponent implements OnChanges, OnDestroy {
  /** Metric key to watch (e.g. 'ai_completions', 'bridge.active_users'). */
  @Input({ required: true }) metric!: string;
  /** Visual chassis variant. Only 'rail' is implemented in US-11. */
  @Input() chassis: Chassis = 'rail';
  /** Optional class applied to the root element. */
  @Input() className = '';
  /** Override the default Upgrade CTA click handler. */
  @Input() onActionClick?: (snap: QuotaSnapshot) => void;
  /** Optional display label override. Defaults to the snapshot's `.label`. */
  @Input() label?: string;

  private _quota?: BillingSignal<QuotaSnapshot | undefined>;
  private readonly _fallback = signal<QuotaSnapshot | undefined>(undefined);
  protected readonly snapshot = computed<QuotaSnapshot | undefined>(() =>
    this._quota ? this._quota.value() : this._fallback(),
  );

  protected readonly isBillingAdmin = signal(false);

  protected readonly warningLevel = computed(() => this.snapshot()?.warningLevel ?? null);
  protected readonly overCap = computed(() => {
    const s = this.snapshot();
    return s ? s.used > s.limit : false;
  });
  protected readonly visible = computed(
    () => this.snapshot() !== undefined && this.warningLevel() !== null,
  );
  protected readonly severity = computed<Severity>(() =>
    this.warningLevel() === 'critical' || this.overCap() ? 'critical' : 'warn',
  );
  protected readonly displayLabel = computed(
    () => this.label ?? this.snapshot()?.label ?? this.metric,
  );
  protected readonly percent = computed(() => {
    const s = this.snapshot();
    return s && s.limit > 0 ? Math.min(100, Math.round((s.used / s.limit) * 100)) : 0;
  });
  protected readonly copy = computed(() =>
    getCopy(this.snapshot(), this.isBillingAdmin(), this.displayLabel(), this.warningLevel()),
  );

  constructor(private authService: AuthService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['metric']) {
      this._quota?.destroy();
      this._quota = createQuotaSignal(this.metric);
    }
    // Role variant. v1 policy: workspace owner only, via canManageBilling()
    // (immutable OWNER role key).
    try {
      this.isBillingAdmin.set(this.authService.getBridgeAuth().canManageBilling());
    } catch {
      /* no BridgeAuth instance — member variant */
    }
  }

  ngOnDestroy(): void {
    this._quota?.destroy();
  }

  handleAction(): void {
    const snap = this.snapshot();
    if (!snap) return;
    if (this.onActionClick) {
      this.onActionClick(snap);
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/billing';
    }
  }
}

function getCopy(
  snap: QuotaSnapshot | undefined,
  admin: boolean,
  displayLabel: string,
  warningLevel: QuotaSnapshot['warningLevel'] | null,
): { title: string; body: string; cta?: string } {
  if (!snap) return { title: '', body: '' };
  const over = snap.used > snap.limit;
  const remaining = Math.max(0, snap.remaining);
  if (over) {
    return admin
      ? {
          title: `${displayLabel} over cap`,
          body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()}. Upgrade your plan to add headroom.`,
          cta: 'Upgrade',
        }
      : {
          title: `${displayLabel} over cap`,
          body: `Your workspace is over its ${displayLabel} cap. Contact your workspace owner.`,
        };
  }
  if (warningLevel === 'critical') {
    return admin
      ? {
          title: `${displayLabel} near cap`,
          body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} (${remaining.toLocaleString()} left). Upgrade to avoid hitting the cap.`,
          cta: 'Upgrade',
        }
      : {
          title: `${displayLabel} near cap`,
          body: `Your workspace is approaching its ${displayLabel} cap. Contact your workspace owner.`,
        };
  }
  return admin
    ? {
        title: `${displayLabel} approaching cap`,
        body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} (${remaining.toLocaleString()} left).`,
        cta: 'Upgrade',
      }
    : {
        title: `${displayLabel} approaching cap`,
        body: `Your workspace is approaching its ${displayLabel} cap.`,
      };
}
