/**
 * `<bridge-feature-flag>` — declarative Feature Flags 2.0 component for Angular.
 * Angular port of bridge-svelte's `flags/FeatureFlag.svelte`.
 *
 * Renders projected content when Bridge's rule passed (flag on for this user),
 * else renders the fallback slot. Reactive — re-renders when the flag changes
 * in the cache (realtime push, token change, dev-attribute change).
 *
 * Two content slots (Angular content projection):
 *   - default slot — rendered when the flag passed.
 *   - `*bridgeFeatureFlagFallback` structural directive — rendered when off.
 *     TBP-756 — its template context says why the feature is off
 *     ({@link FeatureFlagFallbackContext}): `reason` is `'plan'` (an upgrade
 *     alone would turn it on), `'permission'` (this person's role or
 *     privileges), `'off'`, `'rule'`, `'rollout'`, or undefined when Bridge
 *     has not said (the flag is not loaded yet); `feature` is, with `'plan'`,
 *     the plan feature the rule asks for; `$implicit` / `value` is the value
 *     Bridge decided.
 *
 * Inputs mirror svelte's `<FeatureFlag>`:
 *   - `key` (required) — the flag key.
 *   - `defaultValue` — value when no rule matched / cache cold. Default `false`.
 *   - `context` — optional per-call EvalContext for dev-supplied attributes.
 *
 * Usage:
 *   <bridge-feature-flag key="new-dashboard" [defaultValue]="false">
 *     <new-dashboard />
 *     <p *bridgeFeatureFlagFallback>Coming soon</p>
 *   </bridge-feature-flag>
 *
 *   <bridge-feature-flag key="reports">
 *     <app-reports />
 *     <p *bridgeFeatureFlagFallback="let reason = reason">
 *       @if (reason === 'plan') { <a routerLink="/billing">Upgrade for reports</a> }
 *     </p>
 *   </bridge-feature-flag>
 *
 * TBP-744 — `upgrade` (opt-in, parity with svelte's `upgrade` prop): with no
 * fallback, a feature that is off because of the plan renders a small
 * "Upgrade to use this" button in its place; clicking it opens the upgrade
 * dialog. The fallback context also carries `openUpgrade()` for a custom
 * prompt. Nothing opens by itself — only a click does.
 *
 *   <bridge-feature-flag key="analytics" [upgrade]="true">
 *     <a routerLink="/analytics">Analytics</a>
 *   </bridge-feature-flag>
 */
import {
  Component,
  ContentChild,
  Directive,
  Input,
  TemplateRef,
  computed,
  signal,
  type Signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { EvalContext, FlagEvalResult, FlagOffReason } from '@nebulr-group/bridge-auth-core';
import { BridgeService } from '../../core/bridge.service';
import { openFeatureUpgrade } from '../../billing/quota-refusal';

/** TBP-756 — what a `<bridge-feature-flag>` fallback learns about why the feature is off. */
export interface FeatureFlagFallbackContext<T = unknown> {
  /** The value Bridge decided (`let value` / `let v = value`). */
  $implicit: T;
  value: T;
  /** Why the feature is off; undefined when Bridge has not said. */
  reason: FlagOffReason | undefined;
  /** With `reason: 'plan'`, the plan feature the rule asks for. */
  feature: string | undefined;
  /** TBP-744 — open the upgrade dialog for this feature. Call it from a click. */
  openUpgrade: () => void;
}

/** Structural directive marking the fallback slot of `<bridge-feature-flag>`. */
@Directive({
  selector: '[bridgeFeatureFlagFallback]',
  standalone: true,
})
export class BridgeFeatureFlagFallbackDirective {
  constructor(public templateRef: TemplateRef<FeatureFlagFallbackContext>) {}

  static ngTemplateContextGuard(
    _dir: BridgeFeatureFlagFallbackDirective,
    ctx: unknown,
  ): ctx is FeatureFlagFallbackContext {
    return true;
  }
}

@Component({
  selector: 'bridge-feature-flag',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (result().passed) {
      <ng-content></ng-content>
    } @else if (fallback) {
      <ng-container
        [ngTemplateOutlet]="fallback.templateRef"
        [ngTemplateOutletContext]="offContext()"
      ></ng-container>
    } @else if (upgrade && offContext().reason === 'plan') {
      <button
        type="button"
        class="bridge-btn bridge-btn-secondary bridge-feature-upgrade"
        [attr.data-bridge-feature-upgrade]="key"
        (click)="offContext().openUpgrade()"
      >
        Upgrade to use this
      </button>
    }
  `,
})
export class FeatureFlagComponent<T = boolean> {
  private readonly _key = signal<string>('');
  private readonly _defaultValue = signal<T>(false as unknown as T);
  private readonly _context = signal<Partial<EvalContext> | undefined>(undefined);

  /** The flag key. */
  @Input({ required: true }) set key(value: string) {
    this._key.set(value);
  }
  get key(): string {
    return this._key();
  }

  /** Value when no rule matched / cache cold. */
  @Input() set defaultValue(value: T) {
    this._defaultValue.set(value);
  }

  /**
   * TBP-744 — opt in to an inline "Upgrade to use this" prompt when the feature
   * is off because of the plan and there is no fallback template.
   */
  @Input() upgrade = false;

  /** Optional per-call EvalContext (dev-supplied attributes win on collision). */
  @Input() set context(value: Partial<EvalContext> | undefined) {
    this._context.set(value);
  }

  /** Optional fallback slot, rendered when the flag is off. */
  @ContentChild(BridgeFeatureFlagFallbackDirective)
  fallback?: BridgeFeatureFlagFallbackDirective;

  /** Reactive evaluation result — re-runs whenever the flag changes. */
  protected readonly result: Signal<FlagEvalResult<T>>;

  /** TBP-756 — the fallback's template context: the value and why it is off. */
  protected readonly offContext: Signal<FeatureFlagFallbackContext<T>>;

  constructor(private bridge: BridgeService) {
    this.result = computed(() => {
      // Reactive dependency on the flag-cache version map so this re-runs on
      // every flag change (realtime, token, dev-attribute).
      this.bridge._flagVersions();
      const key = this._key();
      const def = this._defaultValue();
      const ctx = this._context();
      if (!key) return { passed: false, value: def };
      return this.bridge.evaluate<T>(key, def, ctx);
    });
    this.offContext = computed(() => {
      const r = this.result();
      const key = this._key();
      return {
        $implicit: r.value,
        value: r.value,
        reason: r.reason,
        feature: r.feature,
        openUpgrade: () => openFeatureUpgrade({ flag: key, feature: r.feature ?? null }),
      };
    });
  }
}
